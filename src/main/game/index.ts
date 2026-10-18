import { parse, stringify } from '../utils/yaml'
import { createLogger } from '../utils/logger'
import { GAME_ACCEL_LOG_SCOPE } from '../../shared/game/constants'
import type {
  GameAccelConfig,
  GameAccelDiagnostic,
  GameAccelPreview,
  GameAccelState,
  GeneratedSummary
} from '../../shared/game/types'
import { compileGameAccel } from './compiler'
import { getAntiCheatPreset, listBuiltinPresets } from './presets'
import { loadGameAccelConfig } from './store'

const logger = createLogger(GAME_ACCEL_LOG_SCOPE)
let lastSummary: GeneratedSummary | undefined
let lastDiagnostics: GameAccelDiagnostic[] = []

async function getConfig(): Promise<GameAccelConfig> {
  return loadGameAccelConfig()
}

export async function initGameAccel(): Promise<void> {
  try {
    const config = await getConfig()
    lastDiagnostics = []
    logger.info(`Game acceleration initialized, enabled=${config.enable}`)
  } catch (error) {
    logger.warn('Failed to initialize game acceleration', error)
  }
}

export async function getGameAccelState(): Promise<GameAccelState> {
  const config = await getConfig()
  return {
    enable: config.enable,
    config,
    ...(lastSummary ? { lastCompile: lastSummary } : {}),
    diagnostics: lastDiagnostics
  }
}

export async function applyGameAccel(profile: IMihomoConfig): Promise<IMihomoConfig> {
  try {
    const config = await getConfig()
    if (!config.enable) {
      lastSummary = undefined
      lastDiagnostics = []
      return profile
    }
    const result = compileGameAccel({
      profile,
      config,
      presets: listBuiltinPresets(),
      antiCheatPreset: getAntiCheatPreset(),
      platform: process.platform
    })
    lastSummary = result.summary
    lastDiagnostics = result.diagnostics
    return result.profile
  } catch (error) {
    logger.warn('Failed to apply game acceleration', error)
    return profile
  }
}

export async function finalizeGameProfile(profile: IMihomoConfig): Promise<IMihomoConfig> {
  return applyGameAccel(profile)
}

export async function finalizeGameYaml(yaml: string): Promise<string> {
  try {
    const config = await getConfig()
    if (!config.enable) return yaml
    const profile = parse(yaml) as IMihomoConfig
    return stringify(await applyGameAccel(profile))
  } catch (error) {
    logger.warn('Failed to finalize simple mode game acceleration', error)
    return yaml
  }
}

export async function getGameAccelPreview(): Promise<GameAccelPreview> {
  const config = await getConfig()
  // Dynamic import avoids a static factory <-> game module cycle.
  const { getRuntimeConfig } = await import('../core/factory')
  const profile = await getRuntimeConfig()
  const result = compileGameAccel({
    profile,
    config,
    presets: listBuiltinPresets(),
    antiCheatPreset: getAntiCheatPreset(),
    platform: process.platform
  })
  return {
    yaml: stringify(result.profile),
    summary: result.summary,
    diagnostics: result.diagnostics
  }
}

export async function runGameAccelDiagnose(): Promise<GameAccelDiagnostic[]> {
  const state = await getGameAccelState()
  return state.diagnostics
}
