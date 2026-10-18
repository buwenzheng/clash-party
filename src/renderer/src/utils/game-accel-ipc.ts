import { GAME_ACCEL_INVOKE_CHANNELS } from '../../../shared/game/ipc-channels'
import type {
  GameAccelAddResult,
  GameAccelConfig,
  GameAccelConfigPatch,
  GameAccelDiagnostic,
  GameAccelPreview,
  GameAccelState,
  GameCandidate,
  GameItem,
  PlatformPreset
} from '../../../shared/game/types'

function checkIpcError<T>(response: unknown): T {
  if (response && typeof response === 'object' && 'invokeError' in response) {
    throw (response as { invokeError: unknown }).invokeError
  }
  return response as T
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await window.electron.ipcRenderer.invoke(channel, ...args)
  return checkIpcError<T>(response)
}

export function gameAccelGetConfig(): Promise<GameAccelConfig> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.getConfig)
}

export function gameAccelPatchConfig(patch: GameAccelConfigPatch): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.patchConfig, patch)
}

export function gameAccelSetEnable(enable: boolean): Promise<GameAccelDiagnostic[]> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.setEnable, enable)
}

export function gameAccelUpsertGame(game: GameItem): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.upsertGame, game)
}

export function gameAccelRemoveGame(id: string): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.removeGame, id)
}

export function gameAccelAddFromPath(filePath: string): Promise<GameAccelAddResult> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.addFromPath, filePath)
}

export function gameAccelScan(): Promise<GameCandidate[]> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.scan)
}

export function gameAccelPreview(): Promise<GameAccelPreview> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.preview)
}

export function gameAccelDiagnose(): Promise<GameAccelDiagnostic[]> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.diagnose)
}

export function gameAccelGetPresets(): Promise<PlatformPreset[]> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.getPresets)
}

export function gameAccelGetState(): Promise<GameAccelState> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.getState)
}
