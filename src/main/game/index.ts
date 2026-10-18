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
import { restorePendingGlobal } from './live'
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
    await restorePendingGlobal()
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

function stripGeneratedGroups(profile: IMihomoConfig, config: GameAccelConfig): IMihomoConfig {
  const names = new Set([
    config.groupNames.game,
    config.groupNames.platform,
    config.groupNames.download
  ])
  const next = structuredClone(profile) as unknown as Record<string, unknown>
  const groups = Array.isArray(next['proxy-groups'])
    ? (next['proxy-groups'] as { name?: string }[])
    : []
  next['proxy-groups'] = groups.filter(
    (group) =>
      !group.name ||
      (!names.has(group.name) && !group.name.startsWith(config.groupNames.regionPrefix))
  )
  const rules = Array.isArray(next.rules) ? (next.rules as string[]) : []
  next.rules = rules.filter((rule) => {
    const target = rule.split(',').at(-1)
    return !target || !names.has(target)
  })
  return next as unknown as IMihomoConfig
}

export async function getGameAccelPreview(): Promise<GameAccelPreview> {
  const config = await getConfig()
  // Dynamic import avoids a static factory <-> game module cycle.
  const { getRuntimeConfig } = await import('../core/factory')
  const profile = await getRuntimeConfig()
  const result = compileGameAccel({
    profile: stripGeneratedGroups(profile, config),
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
  const diagnostics = [...state.diagnostics]
  if (!state.enable) return diagnostics

  const { getRuntimeConfig } = await import('../core/factory')
  const profile = await getRuntimeConfig()
  if (!profile) return diagnostics

  if (profile.tun?.enable !== true) {
    diagnostics.push({
      level: 'warning',
      code: 'TUN_DISABLED',
      message: 'TUN is disabled; game traffic may not be captured.'
    })
  } else {
    try {
      const { checkTunPermissions } = await import('../core/permissions')
      if (!(await checkTunPermissions())) {
        diagnostics.push({
          level: 'warning',
          code: 'TUN_PERMISSION_MISSING',
          message: 'TUN permissions are missing; grant them from the TUN page.',
          fix: 'tun-permissions'
        })
      }
    } catch {
      // Permission probing is best-effort on unsupported platforms.
    }
  }
  if (profile['find-process-mode'] === 'off') {
    diagnostics.push({
      level: 'warning',
      code: 'PROCESS_MODE_OFF',
      message: 'find-process-mode is off; process matching may fail.'
    })
  }
  if (!profile.proxies?.length) {
    diagnostics.push({
      level: 'error',
      code: 'NO_PROXIES',
      message: 'No proxy nodes are available.'
    })
  }

  const groups = Array.isArray(profile['proxy-groups'])
    ? (profile['proxy-groups'] as { name?: string }[])
    : []
  for (const name of [
    state.config.groupNames.game,
    state.config.groupNames.platform,
    state.config.groupNames.download
  ]) {
    if (!groups.some((group) => group.name === name)) {
      diagnostics.push({
        level: 'error',
        code: 'GAME_GROUP_MISSING',
        message: 'The generated game strategy group is missing.',
        params: { name }
      })
    }
  }
  return diagnostics
}
