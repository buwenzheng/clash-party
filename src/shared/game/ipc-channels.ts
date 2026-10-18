export const GAME_ACCEL_INVOKE_CHANNELS = {
  getConfig: 'gameAccelGetConfig',
  patchConfig: 'gameAccelPatchConfig',
  setEnable: 'gameAccelSetEnable',
  upsertGame: 'gameAccelUpsertGame',
  removeGame: 'gameAccelRemoveGame',
  addFromPath: 'gameAccelAddFromPath',
  preview: 'gameAccelPreview',
  diagnose: 'gameAccelDiagnose',
  getPresets: 'gameAccelGetPresets',
  getState: 'gameAccelGetState'
} as const

export const GAME_ACCEL_LISTEN_CHANNELS = {
  updated: 'gameAccelUpdated'
} as const

export type GameAccelInvokeChannel =
  (typeof GAME_ACCEL_INVOKE_CHANNELS)[keyof typeof GAME_ACCEL_INVOKE_CHANNELS]
export type GameAccelListenChannel =
  (typeof GAME_ACCEL_LISTEN_CHANNELS)[keyof typeof GAME_ACCEL_LISTEN_CHANNELS]

export const GAME_ACCEL_INVOKE_CHANNEL_LIST = Object.values(GAME_ACCEL_INVOKE_CHANNELS)
export const GAME_ACCEL_LISTEN_CHANNEL_LIST = Object.values(GAME_ACCEL_LISTEN_CHANNELS)
