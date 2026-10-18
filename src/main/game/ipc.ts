import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import {
  GAME_ACCEL_INVOKE_CHANNELS,
  GAME_ACCEL_LISTEN_CHANNELS
} from '../../shared/game/ipc-channels'
import type {
  GameAccelAddResult,
  GameAccelConfig,
  GameAccelConfigPatch,
  GameAccelDiagnostic,
  GameAccelLiveState,
  GameAccelPreview,
  GameAccelState,
  GameCandidate,
  GameItem,
  GuardAlert,
  PlatformPreset
} from '../../shared/game/types'
import {
  mihomoChangeProxy,
  mihomoGroupDelay,
  mihomoGroups,
  mihomoHotReloadConfig,
  mihomoUnfixedProxy
} from '../core/mihomoApi'
import { mainWindow } from '../window'
import { isValidDomain, normalizeDomain } from '../../shared/game/rule-utils'
import {
  getGameLiveState,
  getGuardAlerts,
  handleGuardAlert as markGuardAlertHandled,
  startGameCapture,
  stopGameCapture
} from './live'
import { listBuiltinPresets, mergePlatformPreset } from './presets'
import { scanGameCandidates } from './scan'
import { loadGameAccelConfig, patchGameAccelConfig } from './store'
import { getGameAccelPreview, getGameAccelState, runGameAccelDiagnose } from './index'

function notifyUpdated(): void {
  mainWindow?.webContents.send(GAME_ACCEL_LISTEN_CHANNELS.updated)
}

function normalizePath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

async function buildGameFromPath(input: string): Promise<GameItem> {
  if (!input.trim()) throw new Error('Game path is required')
  const target = path.resolve(input.trim())
  const info = await stat(target).catch(() => undefined)
  if (!info) throw new Error('Game path does not exist')

  let icon: string | undefined
  try {
    const image = await app.getFileIcon(target, { size: 'normal' })
    if (!image.isEmpty()) icon = image.toDataURL()
  } catch {
    // Icon extraction is best-effort.
  }

  const now = Date.now()
  if (info.isDirectory()) {
    return {
      id: randomUUID(),
      name: path.basename(target) || target,
      source: 'manual',
      enable: true,
      match: {
        directories: [target],
        processNames: [],
        processPaths: [],
        domains: [],
        ipCidrs: []
      },
      policy: 'inherit',
      routeMode: 'process',
      icon,
      createdAt: now,
      updatedAt: now
    }
  }

  if (!info.isFile() || path.extname(target).toLowerCase() !== '.exe') {
    throw new Error('Only .exe files or game folders are supported')
  }

  return {
    id: randomUUID(),
    name: path.basename(target, path.extname(target)),
    source: 'manual',
    enable: true,
    match: {
      directories: [path.dirname(target)],
      processNames: [path.basename(target)],
      processPaths: [target],
      domains: [],
      ipCidrs: []
    },
    policy: 'inherit',
    routeMode: 'process',
    icon,
    createdAt: now,
    updatedAt: now
  }
}

export async function gameAccelAddFromPath(filePath: string): Promise<GameAccelAddResult> {
  const game = await buildGameFromPath(filePath)
  const config = await loadGameAccelConfig()
  const targetPaths = new Set(
    [...game.match.processPaths, ...game.match.directories].map(normalizePath)
  )
  const existing = config.games.find((item) =>
    [...item.match.processPaths, ...item.match.directories]
      .map(normalizePath)
      .some((value) => targetPaths.has(value))
  )
  return existing ? { game: existing, duplicate: true } : { game, duplicate: false }
}

export async function gameAccelScan(): Promise<GameCandidate[]> {
  return scanGameCandidates()
}

export async function gameAccelGetLiveState(): Promise<GameAccelLiveState> {
  return getGameLiveState()
}

export async function gameAccelStartCapture(): Promise<void> {
  startGameCapture()
}

export async function gameAccelStopCapture(): Promise<void> {
  stopGameCapture()
}

export async function gameAccelGuardAlerts(): Promise<GuardAlert[]> {
  return getGuardAlerts()
}

export async function gameAccelMarkHost(host: string, action: 'direct' | 'proxy'): Promise<void> {
  if (!isValidDomain(host)) throw new Error('Invalid host')
  const domain = normalizeDomain(host)
  if (!domain) throw new Error('Invalid host')
  const config = await loadGameAccelConfig()
  const customDirect = config.customDirect.filter((entry) => entry.value !== domain)
  const customProxy = config.customProxy.filter((entry) => entry !== domain)
  if (action === 'direct') {
    customDirect.push({ value: domain, kind: 'domain', origin: 'user', addedAt: Date.now() })
  } else {
    customProxy.push(domain)
  }
  await patchGameAccelConfig({ customDirect, customProxy })
  await mihomoHotReloadConfig()
  notifyUpdated()
}

export async function gameAccelHandleGuardAlert(
  id: string,
  action: 'direct' | 'proxy' | 'downloadMode' | 'ignored' | 'auto'
): Promise<GuardAlert | undefined> {
  const alert = markGuardAlertHandled(id, action)
  if (!alert) return undefined
  if (action === 'direct' || action === 'proxy') {
    await gameAccelMarkHost(alert.host, action)
  }
  return alert
}

export async function gameAccelOptimizeGroup(groupName: string): Promise<string | undefined> {
  const config = await loadGameAccelConfig()
  const target = groupName || config.groupNames.game
  if (!target) throw new Error('Group name is required')
  const groups = await mihomoGroups()
  const group = groups.find((item) => item.name === target)
  if (!group) throw new Error('Group not found')
  const delays = await mihomoGroupDelay(target)
  let best: string | undefined
  let bestDelay = Number.POSITIVE_INFINITY
  for (const proxy of group.all) {
    const delay = delays[proxy.name]
    if (typeof delay === 'number' && delay > 0 && delay < bestDelay) {
      best = proxy.name
      bestDelay = delay
    }
  }
  if (!best) return undefined
  await mihomoChangeProxy(target, best)
  return best
}

export async function gameAccelSetPlatformDirect(): Promise<void> {
  const config = await loadGameAccelConfig()
  await mihomoChangeProxy(config.groupNames.platform, 'DIRECT')
}

export async function gameAccelRestoreAuto(): Promise<void> {
  const config = await loadGameAccelConfig()
  try {
    await mihomoUnfixedProxy(config.groupNames.platform)
  } catch (error) {
    if (!String(error).includes('Body invalid')) throw error
  }
}

export async function gameAccelGetConfig(): Promise<GameAccelConfig> {
  return loadGameAccelConfig()
}

export async function gameAccelPatchConfig(patch: GameAccelConfigPatch): Promise<void> {
  await patchGameAccelConfig(patch)
  await mihomoHotReloadConfig()
  notifyUpdated()
}

export async function gameAccelSetEnable(enable: boolean): Promise<GameAccelDiagnostic[]> {
  await patchGameAccelConfig({ enable })
  await mihomoHotReloadConfig()
  notifyUpdated()
  return runGameAccelDiagnose()
}

export async function gameAccelUpsertGame(game: GameItem): Promise<void> {
  const config = await loadGameAccelConfig()
  const games = [...config.games]
  const index = games.findIndex((item) => item.id === game.id)
  const now = Date.now()
  if (index >= 0) {
    games[index] = { ...game, createdAt: games[index].createdAt, updatedAt: now }
  } else {
    games.push({ ...game, createdAt: game.createdAt || now, updatedAt: now })
  }
  await patchGameAccelConfig({ games })
  await mihomoHotReloadConfig()
  notifyUpdated()
}

export async function gameAccelRemoveGame(id: string): Promise<void> {
  const config = await loadGameAccelConfig()
  await patchGameAccelConfig({ games: config.games.filter((game) => game.id !== id) })
  await mihomoHotReloadConfig()
  notifyUpdated()
}

export async function gameAccelPreview(): Promise<GameAccelPreview> {
  return getGameAccelPreview()
}

export async function gameAccelDiagnose(): Promise<GameAccelDiagnostic[]> {
  return runGameAccelDiagnose()
}

export async function gameAccelGetPresets(): Promise<PlatformPreset[]> {
  const config = await loadGameAccelConfig()
  return listBuiltinPresets().map((preset) =>
    mergePlatformPreset(preset, config.platforms[preset.id])
  )
}

export async function gameAccelGetState(): Promise<GameAccelState> {
  return getGameAccelState()
}

export const gameAccelHandlers = {
  [GAME_ACCEL_INVOKE_CHANNELS.getConfig]: gameAccelGetConfig,
  [GAME_ACCEL_INVOKE_CHANNELS.patchConfig]: gameAccelPatchConfig,
  [GAME_ACCEL_INVOKE_CHANNELS.setEnable]: gameAccelSetEnable,
  [GAME_ACCEL_INVOKE_CHANNELS.upsertGame]: gameAccelUpsertGame,
  [GAME_ACCEL_INVOKE_CHANNELS.removeGame]: gameAccelRemoveGame,
  [GAME_ACCEL_INVOKE_CHANNELS.addFromPath]: gameAccelAddFromPath,
  [GAME_ACCEL_INVOKE_CHANNELS.scan]: gameAccelScan,
  [GAME_ACCEL_INVOKE_CHANNELS.getLiveState]: gameAccelGetLiveState,
  [GAME_ACCEL_INVOKE_CHANNELS.startCapture]: gameAccelStartCapture,
  [GAME_ACCEL_INVOKE_CHANNELS.stopCapture]: gameAccelStopCapture,
  [GAME_ACCEL_INVOKE_CHANNELS.guardAlerts]: gameAccelGuardAlerts,
  [GAME_ACCEL_INVOKE_CHANNELS.handleGuardAlert]: gameAccelHandleGuardAlert,
  [GAME_ACCEL_INVOKE_CHANNELS.markHost]: gameAccelMarkHost,
  [GAME_ACCEL_INVOKE_CHANNELS.optimizeGroup]: gameAccelOptimizeGroup,
  [GAME_ACCEL_INVOKE_CHANNELS.setPlatformDirect]: gameAccelSetPlatformDirect,
  [GAME_ACCEL_INVOKE_CHANNELS.restoreAuto]: gameAccelRestoreAuto,
  [GAME_ACCEL_INVOKE_CHANNELS.preview]: gameAccelPreview,
  [GAME_ACCEL_INVOKE_CHANNELS.diagnose]: gameAccelDiagnose,
  [GAME_ACCEL_INVOKE_CHANNELS.getPresets]: gameAccelGetPresets,
  [GAME_ACCEL_INVOKE_CHANNELS.getState]: gameAccelGetState
}
