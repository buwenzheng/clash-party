import type { AntiCheatPreset, PlatformPreset, PlatformSetting } from '../../../shared/game/types'
import { ANTI_CHEAT_PRESET } from './anti-cheat'
import { EPIC_PRESET } from './epic'
import {
  BATTLENET_PRESET,
  EA_PRESET,
  GOG_PRESET,
  UBISOFT_PRESET,
  XBOX_PRESET
} from './other-platforms'
import { STEAM_PRESET } from './steam'

const BUILTIN_PRESETS: Record<string, PlatformPreset> = {
  steam: STEAM_PRESET,
  epic: EPIC_PRESET,
  gog: GOG_PRESET,
  ubisoft: UBISOFT_PRESET,
  ea: EA_PRESET,
  battlenet: BATTLENET_PRESET,
  xbox: XBOX_PRESET
}

export function listBuiltinPresets(): PlatformPreset[] {
  return Object.values(BUILTIN_PRESETS)
}

export function getBuiltinPreset(id: string): PlatformPreset | undefined {
  return BUILTIN_PRESETS[id]
}

export function getAntiCheatPreset(): AntiCheatPreset {
  return ANTI_CHEAT_PRESET
}

export function mergePlatformPreset(
  preset: PlatformPreset,
  setting?: PlatformSetting
): PlatformPreset {
  if (!setting) return preset
  const removed = new Set(setting.removed)
  const unique = (values: string[] = []): string[] =>
    Array.from(new Set(values)).filter((value) => !removed.has(value))

  return {
    ...preset,
    download: {
      ...preset.download,
      domain: unique(preset.download.domain),
      domainSuffix: unique([...(preset.download.domainSuffix ?? []), ...setting.extraDownload]),
      domainKeyword: unique([
        ...(preset.download.domainKeyword ?? []),
        ...setting.extraDownloadKeyword
      ])
    },
    platform: {
      ...preset.platform,
      domain: unique(preset.platform.domain),
      domainSuffix: unique([...(preset.platform.domainSuffix ?? []), ...setting.extraPlatform]),
      domainKeyword: unique(preset.platform.domainKeyword)
    }
  }
}
