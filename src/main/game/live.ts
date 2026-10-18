import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { GAME_ACCEL_LISTEN_CHANNELS } from '../../shared/game/ipc-channels'
import type {
  CaptureProcess,
  GameAccelConfig,
  GameAccelLiveState,
  GameTrafficTop,
  GuardAlert
} from '../../shared/game/types'
import { loadGameAccelConfig, patchGameAccelConfig } from './store'

let latestInfo: IMihomoConnectionsInfo | undefined
let processing = false
let live: GameAccelLiveState = {
  updatedAt: 0,
  connections: 0,
  upload: 0,
  download: 0,
  uploadSpeed: 0,
  downloadSpeed: 0,
  captureActive: false,
  capture: [],
  alerts: []
}
let captureActive = false
let captureStartedAt = 0
let capturePreexisting = new Set<string>()
let alerts: GuardAlert[] = []
let lastNotifyAt = 0
let configCache: { at: number; config: GameAccelConfig } | undefined
let globalGameId: string | undefined
let globalBusy = false
const guardSince = new Map<string, number>()
const guardAlertAt = new Map<string, number>()

async function getConfig(): Promise<GameAccelConfig> {
  if (configCache && Date.now() - configCache.at < 2000) return configCache.config
  const config = await loadGameAccelConfig()
  configCache = { at: Date.now(), config }
  return config
}

function connectionKey(connection: IMihomoConnectionDetail): string {
  return connection.metadata.processPath || connection.metadata.process || connection.id
}

function connectionName(connection: IMihomoConnectionDetail): string {
  return (
    connection.metadata.process ||
    path.basename(connection.metadata.processPath || '') ||
    connection.metadata.host ||
    'unknown'
  )
}

function matchesGame(
  game: GameAccelConfig['games'][number],
  connection: IMihomoConnectionDetail
): boolean {
  const processName = connection.metadata.process.toLowerCase()
  const processPath = connection.metadata.processPath.toLowerCase()
  if (game.match.processNames.some((name) => name.toLowerCase() === processName)) return true
  if (game.match.processPaths.some((value) => value.toLowerCase() === processPath)) return true
  return game.match.directories.some((directory) => {
    const base = directory.toLowerCase().replace(/[\\\\/]+$/, '')
    return Boolean(base && processPath.startsWith(`${base}${path.sep}`))
  })
}

function findCurrentGame(
  config: GameAccelConfig,
  connections: IMihomoConnectionDetail[]
): GameAccelLiveState['currentGame'] {
  for (const game of config.games.filter((item) => item.enable)) {
    if (connections.some((connection) => matchesGame(game, connection))) {
      return { id: game.id, name: game.name }
    }
  }
  return undefined
}

function findGlobalGame(
  config: GameAccelConfig,
  connections: IMihomoConnectionDetail[]
): GameAccelConfig['games'][number] | undefined {
  return config.games.find(
    (game) =>
      game.enable &&
      game.routeMode === 'global' &&
      connections.some((connection) => matchesGame(game, connection))
  )
}

export async function restorePendingGlobal(): Promise<void> {
  const config = await loadGameAccelConfig().catch(() => undefined)
  const pending = config?.pendingGlobalRestore
  if (!pending) {
    globalGameId = undefined
    return
  }
  try {
    const { patchMihomoConfig } = await import('../core/mihomoApi')
    await patchMihomoConfig({
      mode: pending.mode,
      ...(pending.global ? { GLOBAL: pending.global } : {})
    } as unknown as Partial<IMihomoConfig>)
    await patchGameAccelConfig({ pendingGlobalRestore: undefined })
  } catch {
    // Keep the marker for the next startup attempt.
  }
  globalGameId = undefined
  configCache = undefined
}

async function handleGlobalFallback(
  config: GameAccelConfig,
  connections: IMihomoConnectionDetail[]
): Promise<void> {
  if (globalBusy) return
  globalBusy = true
  try {
    const active = config.enable ? findGlobalGame(config, connections) : undefined
    if (active) {
      if (globalGameId === active.id || config.pendingGlobalRestore) {
        globalGameId = active.id
        return
      }
      const { getControledMihomoConfig } = await import('../config')
      const { getRuntimeConfig } = await import('../core/factory')
      const controlled = await getControledMihomoConfig()
      const runtime = await getRuntimeConfig()
      const originalGlobal = (runtime as unknown as { GLOBAL?: string } | undefined)?.GLOBAL ?? ''
      await patchGameAccelConfig({
        pendingGlobalRestore: {
          mode: controlled.mode ?? 'rule',
          global: originalGlobal,
          gameId: active.id
        }
      })
      configCache = undefined
      const { patchMihomoConfig } = await import('../core/mihomoApi')
      await patchMihomoConfig({
        mode: 'global',
        GLOBAL: config.groupNames.game
      } as unknown as Partial<IMihomoConfig>)
      globalGameId = active.id
      return
    }
    if (globalGameId || config.pendingGlobalRestore) await restorePendingGlobal()
  } finally {
    globalBusy = false
  }
}

function aggregateCapture(connections: IMihomoConnectionDetail[], now: number): CaptureProcess[] {
  const entries = new Map<
    string,
    {
      process: string
      processPath: string
      connections: number
      udp: number
      upload: number
      download: number
      firstSeen: number
      countries: Set<string>
    }
  >()
  for (const connection of connections) {
    const key = connectionKey(connection)
    const existing = entries.get(key) ?? {
      process: connectionName(connection),
      processPath: connection.metadata.processPath,
      connections: 0,
      udp: 0,
      upload: 0,
      download: 0,
      firstSeen: now,
      countries: new Set<string>()
    }
    existing.connections += 1
    if (connection.metadata.network === 'udp') existing.udp += 1
    existing.upload += connection.upload
    existing.download += connection.download
    const country =
      connection.metadata.destinationGeoIP?.find((value) => value && value !== 'LAN') ??
      connection.metadata.destinationIPASN
    if (country) existing.countries.add(country)
    entries.set(key, existing)
  }
  return [...entries.values()]
    .map((entry) => ({
      process: entry.process,
      processPath: entry.processPath,
      connections: entry.connections,
      udpRatio: entry.connections ? entry.udp / entry.connections : 0,
      countries: [...entry.countries].slice(0, 5),
      upload: entry.upload,
      download: entry.download,
      firstSeen: entry.firstSeen,
      preexisting: capturePreexisting.has(entry.processPath || entry.process),
      suggested: !capturePreexisting.has(entry.processPath || entry.process),
      suggestedRouteMode: 'process' as const
    }))
    .sort((a, b) => b.download - a.download)
    .slice(0, 50)
}

function evaluateGuard(
  config: GameAccelConfig,
  connections: IMihomoConnectionDetail[],
  now: number
): void {
  for (const connection of connections) {
    const host = connection.metadata.host
    if (!host) continue
    const proxied = connection.chains.length > 0 && !connection.chains.includes('DIRECT')
    if (!proxied) continue
    const speed = connection.downloadSpeed ?? 0
    const download = connection.download
    const speedHit = speed >= config.guard.speedThresholdMBps * 1024 * 1024
    const totalHit = download >= config.guard.totalThresholdMB * 1024 * 1024
    const key = `${host}|${connectionName(connection)}`
    if (!speedHit && !totalHit) {
      guardSince.delete(key)
      continue
    }
    const since = guardSince.get(key) ?? now
    guardSince.set(key, since)
    const duration = speedHit ? config.guard.speedDurationSec * 1000 : 0
    if (now - since < duration) continue
    const last = guardAlertAt.get(key) ?? 0
    if (now - last < config.guard.cooldownMin * 60 * 1000) continue
    guardAlertAt.set(key, now)
    const alert: GuardAlert = {
      id: randomUUID(),
      host,
      process: connectionName(connection),
      chain: connection.chains,
      download,
      speed,
      layer: 'unknown',
      suggestedAction: 'direct',
      at: now
    }
    alerts = [alert, ...alerts].slice(0, 20)
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(GAME_ACCEL_LISTEN_CHANNELS.guardAlert, alert)
    }
  }
}

function notifyLive(): void {
  if (Date.now() - lastNotifyAt < 1000) return
  lastNotifyAt = Date.now()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(GAME_ACCEL_LISTEN_CHANNELS.liveUpdated, live)
  }
}

async function processInfo(info: IMihomoConnectionsInfo): Promise<void> {
  const config = await getConfig()
  const connections = info.connections ?? []
  const now = Date.now()
  if (config.enable && config.guard.enable) evaluateGuard(config, connections, now)
  await handleGlobalFallback(config, connections).catch(() => undefined)
  live = {
    updatedAt: now,
    currentGame: config.enable ? findCurrentGame(config, connections) : undefined,
    connections: connections.length,
    upload: info.uploadTotal,
    download: info.downloadTotal,
    uploadSpeed: connections.reduce((sum, item) => sum + (item.uploadSpeed ?? 0), 0),
    downloadSpeed: connections.reduce((sum, item) => sum + (item.downloadSpeed ?? 0), 0),
    captureActive,
    capture: captureActive ? aggregateCapture(connections, now) : [],
    alerts: [...alerts]
  }
  notifyLive()
}

async function processLoop(): Promise<void> {
  processing = true
  try {
    while (latestInfo) {
      const info = latestInfo
      latestInfo = undefined
      await processInfo(info).catch(() => undefined)
    }
  } finally {
    processing = false
  }
}

export function observeGameConnections(info: IMihomoConnectionsInfo): void {
  latestInfo = info
  if (!processing) void processLoop()
}

export function getGameLiveState(): GameAccelLiveState {
  return structuredClone(live)
}

export function getGuardAlerts(): GuardAlert[] {
  return structuredClone(alerts)
}

export function getTrafficTop(limit = 10): GameTrafficTop[] {
  const entries = new Map<string, GameTrafficTop>()
  for (const connection of latestInfo?.connections ?? []) {
    const host = connection.metadata.host || connection.metadata.destinationIP || 'unknown'
    const process = connectionName(connection)
    const key = `${host}|${process}`
    const entry = entries.get(key) ?? {
      host,
      process,
      connections: 0,
      upload: 0,
      download: 0,
      chain: connection.chains
    }
    entry.connections += 1
    entry.upload += connection.upload
    entry.download += connection.download
    entries.set(key, entry)
  }
  return [...entries.values()].sort((a, b) => b.download - a.download).slice(0, Math.max(1, limit))
}

export function startGameCapture(): void {
  captureStartedAt = Date.now()
  capturePreexisting = new Set(
    (latestInfo?.connections ?? []).map((connection) => connectionKey(connection))
  )
  captureActive = true
  live = { ...live, captureActive: true, capture: [] }
}

export function stopGameCapture(): void {
  captureActive = false
  captureStartedAt = 0
  capturePreexisting.clear()
  live = { ...live, captureActive: false, capture: [] }
}

export function handleGuardAlert(
  id: string,
  action: 'direct' | 'proxy' | 'downloadMode' | 'ignored' | 'auto'
): GuardAlert | undefined {
  const alert = alerts.find((item) => item.id === id)
  if (!alert) return undefined
  alert.handled = action
  live = { ...live, alerts: [...alerts] }
  return alert
}

export { captureStartedAt }
