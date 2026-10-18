import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { GAME_ACCEL_LISTEN_CHANNELS } from '../../shared/game/ipc-channels'
import { normalizeDomain } from '../../shared/game/rule-utils'
import type {
  CaptureProcess,
  GameAccelConfig,
  GameAccelLiveState,
  GameTrafficTop,
  GeneratedRule,
  GeneratedRuleLayer,
  GuardAlert
} from '../../shared/game/types'
import { addDirectDomains, loadGameAccelConfig, patchGameAccelConfig } from './store'

const GAME_SESSION_GRACE_MS = 10 * 60 * 1000
const GUARD_RETENTION_MS = 60 * 60 * 1000
const GLOBAL_VERIFY_INTERVAL_MS = 3000
let lastInfo: IMihomoConnectionsInfo | undefined
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
let generatedGroupNames: { game: string; platform: string; download: string } | undefined
let generatedRules: GeneratedRule[] = []
let globalGameId: string | undefined
let globalBusy = false
let lastGlobalVerifyAt = 0
let lastGameAt = 0
let lastGuardCleanup = 0
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

function guardHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

function inferGuardLayer(host: string): GeneratedRuleLayer | 'unknown' {
  for (const item of generatedRules) {
    const [type, value] = item.rule.split(',')
    if (!value) continue
    if (type === 'DOMAIN' && host === value) return item.layer
    if (type === 'DOMAIN-SUFFIX' && (host === value || host.endsWith(`.${value}`))) {
      return item.layer
    }
    if (type === 'DOMAIN-KEYWORD' && host.includes(value)) return item.layer
  }
  return 'unknown'
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
    const { mihomoChangeProxy, patchMihomoConfig } = await import('../core/mihomoApi')
    // Restore the mode first: this may start the core, after which GLOBAL can be selected again.
    await patchMihomoConfig({ mode: pending.mode })
    if (pending.global) {
      await mihomoChangeProxy('GLOBAL', pending.global).catch(() => undefined)
    }
    await patchGameAccelConfig({ pendingGlobalRestore: undefined })
    globalGameId = undefined
    lastGlobalVerifyAt = 0
    configCache = undefined
  } catch {
    // Keep the marker for the next startup attempt.
    globalGameId = undefined
    configCache = undefined
  }
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
        const now = Date.now()
        if (now - lastGlobalVerifyAt >= GLOBAL_VERIFY_INTERVAL_MS) {
          lastGlobalVerifyAt = now
          try {
            const { mihomoChangeProxy, mihomoMode, mihomoProxies, patchMihomoConfig } =
              await import('../core/mihomoApi')
            const target = generatedGroupNames?.game ?? config.groupNames.game
            const [mode, proxies] = await Promise.all([mihomoMode(), mihomoProxies()])
            const global = proxies.proxies.GLOBAL
            const currentGlobal = global && 'now' in global ? global.now : undefined
            if (mode !== 'global' || currentGlobal !== target) {
              await mihomoChangeProxy('GLOBAL', target)
              await patchMihomoConfig({ mode: 'global' })
            }
          } catch {
            // Retry on the next verification interval.
          }
        }
        return
      }
      const { getControledMihomoConfig } = await import('../config')
      const { mihomoChangeProxy, mihomoProxies, patchMihomoConfig } =
        await import('../core/mihomoApi')
      const controlled = await getControledMihomoConfig()
      let originalGlobal = ''
      try {
        const global = (await mihomoProxies()).proxies.GLOBAL
        if (global && 'now' in global) originalGlobal = global.now
      } catch {
        // GLOBAL is unavailable in some core modes; mode restore still works.
      }
      await patchGameAccelConfig({
        pendingGlobalRestore: {
          mode: controlled.mode ?? 'rule',
          ...(originalGlobal ? { global: originalGlobal } : {}),
          gameId: active.id
        }
      })
      configCache = undefined
      try {
        await mihomoChangeProxy('GLOBAL', generatedGroupNames?.game ?? config.groupNames.game)
        await patchMihomoConfig({ mode: 'global' })
        globalGameId = active.id
        lastGlobalVerifyAt = Date.now()
      } catch (error) {
        if (originalGlobal) {
          await mihomoChangeProxy('GLOBAL', originalGlobal).catch(() => undefined)
        }
        await patchGameAccelConfig({ pendingGlobalRestore: undefined }).catch(() => undefined)
        configCache = undefined
        throw error
      }
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

function cleanupGuardMaps(config: GameAccelConfig, now: number): void {
  if (now - lastGuardCleanup < 60_000) return
  lastGuardCleanup = now
  const retention = Math.max(config.guard.cooldownMin * 60 * 1000, GUARD_RETENTION_MS)
  for (const [key, at] of guardAlertAt) {
    if (now - at > retention) guardAlertAt.delete(key)
  }
  for (const [key, at] of guardSince) {
    if (now - at > GUARD_RETENTION_MS) guardSince.delete(key)
  }
}

function evaluateGuard(
  config: GameAccelConfig,
  connections: IMihomoConnectionDetail[],
  now: number
): string[] {
  cleanupGuardMaps(config, now)
  const ignored = new Set(config.guard.ignored)
  const autoDirectHosts = new Set<string>()
  for (const connection of connections) {
    const host = connection.metadata.host ? guardHost(connection.metadata.host) : ''
    if (!host || ignored.has(host)) continue
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
    const auto = config.guard.autoDirect
    const alert: GuardAlert = {
      id: randomUUID(),
      host,
      process: connectionName(connection),
      chain: connection.chains,
      download,
      speed,
      layer: inferGuardLayer(host),
      suggestedAction: 'direct',
      at: now,
      ...(auto ? { handled: 'auto' as const } : {})
    }
    alerts = [alert, ...alerts].slice(0, 20)
    if (auto) {
      autoDirectHosts.add(host)
      continue
    }
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(GAME_ACCEL_LISTEN_CHANNELS.guardAlert, alert)
    }
  }
  return [...autoDirectHosts]
}

async function applyAutoDirectHosts(hosts: string[]): Promise<void> {
  const domains = [
    ...new Set(hosts.map((host) => normalizeDomain(host)).filter((host): host is string => !!host))
  ]
  if (!domains.length) return
  await addDirectDomains(domains, 'guard')
  configCache = undefined
  const { mihomoHotReloadConfig } = await import('../core/mihomoApi')
  await mihomoHotReloadConfig()
  const { mainWindow } = await import('../window')
  mainWindow?.webContents.send(GAME_ACCEL_LISTEN_CHANNELS.updated)
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
  if (config.enable && config.guard.enable) {
    const autoDirectHosts = evaluateGuard(config, connections, now)
    if (autoDirectHosts.length) {
      await applyAutoDirectHosts(autoDirectHosts).catch(() => undefined)
    }
  }
  await handleGlobalFallback(config, connections).catch(() => undefined)
  const currentGame = config.enable ? findCurrentGame(config, connections) : undefined
  if (currentGame) lastGameAt = now
  const idle = !config.enable && !captureActive
  const shouldNotify =
    !idle || live.updatedAt === 0 || Boolean(live.currentGame) || live.captureActive
  live = {
    updatedAt: now,
    currentGame,
    connections: connections.length,
    upload: info.uploadTotal,
    download: info.downloadTotal,
    uploadSpeed: connections.reduce((sum, item) => sum + (item.uploadSpeed ?? 0), 0),
    downloadSpeed: connections.reduce((sum, item) => sum + (item.downloadSpeed ?? 0), 0),
    captureActive,
    capture: captureActive ? aggregateCapture(connections, now) : [],
    alerts: [...alerts]
  }
  if (shouldNotify) notifyLive()
}

async function processLoop(): Promise<void> {
  processing = true
  try {
    while (latestInfo) {
      const info = latestInfo
      latestInfo = undefined
      lastInfo = info
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
  for (const connection of lastInfo?.connections ?? []) {
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
    (lastInfo?.connections ?? []).map((connection) => connectionKey(connection))
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
  action: 'direct' | 'proxy' | 'ignored'
): GuardAlert | undefined {
  const alert = alerts.find((item) => item.id === id)
  if (!alert || alert.handled) return alert
  alert.handled = action
  live = { ...live, alerts: [...alerts] }
  return alert
}

export function isGameSessionActive(now = Date.now()): boolean {
  return Boolean(live.currentGame) || (lastGameAt > 0 && now - lastGameAt < GAME_SESSION_GRACE_MS)
}

export function setGeneratedGroupNames(
  names: { game: string; platform: string; download: string } | undefined
): void {
  generatedGroupNames = names
}

export function setGeneratedRules(rules: GeneratedRule[] | undefined): void {
  generatedRules = rules ?? []
}

export { captureStartedAt }
