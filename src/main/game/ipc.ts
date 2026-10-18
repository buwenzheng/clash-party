import {
  GAME_ACCEL_INVOKE_CHANNELS,
  GAME_ACCEL_LISTEN_CHANNELS
} from '../../shared/game/ipc-channels'
import type {
  GameAccelConfig,
  GameAccelConfigPatch,
  GameAccelDiagnostic,
  GameAccelPreview,
  GameAccelState,
  GameItem,
  PlatformPreset
} from '../../shared/game/types'
import { mihomoHotReloadConfig } from '../core/mihomoApi'
import { mainWindow } from '../window'
import { listBuiltinPresets, mergePlatformPreset } from './presets'
import { loadGameAccelConfig, patchGameAccelConfig } from './store'
import { getGameAccelPreview, getGameAccelState, runGameAccelDiagnose } from './index'

function notifyUpdated(): void {
  mainWindow?.webContents.send(GAME_ACCEL_LISTEN_CHANNELS.updated)
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
  [GAME_ACCEL_INVOKE_CHANNELS.preview]: gameAccelPreview,
  [GAME_ACCEL_INVOKE_CHANNELS.diagnose]: gameAccelDiagnose,
  [GAME_ACCEL_INVOKE_CHANNELS.getPresets]: gameAccelGetPresets,
  [GAME_ACCEL_INVOKE_CHANNELS.getState]: gameAccelGetState
}
