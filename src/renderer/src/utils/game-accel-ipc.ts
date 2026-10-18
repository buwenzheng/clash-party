import { GAME_ACCEL_INVOKE_CHANNELS } from '../../../shared/game/ipc-channels'
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
  GameTrafficTop,
  GuardAlert,
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

export function gameAccelGetLiveState(): Promise<GameAccelLiveState> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.getLiveState)
}

export function gameAccelStartCapture(): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.startCapture)
}

export function gameAccelStopCapture(): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.stopCapture)
}

export function gameAccelGuardAlerts(): Promise<GuardAlert[]> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.guardAlerts)
}

export function gameAccelTrafficTop(limit = 10): Promise<GameTrafficTop[]> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.trafficTop, limit)
}

export function gameAccelHandleGuardAlert(
  id: string,
  action: 'direct' | 'proxy' | 'ignored'
): Promise<GuardAlert | undefined> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.handleGuardAlert, id, action)
}

export function gameAccelMarkHost(host: string, action: 'direct' | 'proxy'): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.markHost, host, action)
}

export function gameAccelOptimizeGroup(groupName: string): Promise<string | undefined> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.optimizeGroup, groupName)
}

export function gameAccelSetPlatformDirect(): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.setPlatformDirect)
}

export function gameAccelRestoreAuto(): Promise<void> {
  return invoke(GAME_ACCEL_INVOKE_CHANNELS.restoreAuto)
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
