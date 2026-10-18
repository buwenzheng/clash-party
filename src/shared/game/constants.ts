import type {
  GameAccelConfig,
  GameAccelGuardConfig,
  GameAccelGroupNames,
  GameAccelSessionConfig,
  GameAccelTuning
} from './types'

export const GAME_ACCEL_CONFIG_VERSION = 1 as const
export const GAME_ACCEL_FILE_NAME = 'game-accel.yaml'
export const GAME_ACCEL_CACHE_FILE_NAME = 'game-accel-cache.json'
export const GAME_ACCEL_PRESETS_FILE_NAME = 'game-accel-presets.json'
export const GAME_ACCEL_LOG_SCOPE = 'game-accel'

export const DEFAULT_GAME_ACCEL_GROUP_NAMES: GameAccelGroupNames = {
  game: '🎮 游戏加速',
  platform: '🌐 游戏平台',
  download: '⬇️ 游戏下载',
  regionPrefix: '🎮 区域·'
}

export const DEFAULT_GAME_ACCEL_TUNING: GameAccelTuning = {
  endpointIndependentNat: true,
  udpTimeout: 300,
  excludeProxyServerIps: true,
  fixFindProcessMode: true,
  gameFakeIpFilter: false,
  downloadDns: true,
  ensureSniffer: true,
  useRuleProviders: true
}

export const DEFAULT_GAME_ACCEL_GUARD: GameAccelGuardConfig = {
  enable: true,
  totalThresholdMB: 200,
  speedThresholdMBps: 5,
  speedDurationSec: 10,
  cooldownMin: 10,
  autoDirect: false,
  ignored: []
}

export const DEFAULT_GAME_ACCEL_SESSION: GameAccelSessionConfig = {
  protect: true
}

export const GAME_ACCEL_INLINE_RULE_PROVIDER_THRESHOLD = 200
export const GAME_ACCEL_DEFAULT_TEST_URL = 'https://www.gstatic.com/generate_204'

export function createDefaultGameAccelConfig(): GameAccelConfig {
  return {
    version: GAME_ACCEL_CONFIG_VERSION,
    enable: false,
    mode: 'overlay',
    downloadViaProxy: false,
    groupNames: { ...DEFAULT_GAME_ACCEL_GROUP_NAMES },
    regions: [],
    platforms: {},
    antiCheat: true,
    customDirect: [],
    customProxy: [],
    games: [],
    tuning: { ...DEFAULT_GAME_ACCEL_TUNING },
    guard: { ...DEFAULT_GAME_ACCEL_GUARD, ignored: [] },
    session: { ...DEFAULT_GAME_ACCEL_SESSION }
  }
}
