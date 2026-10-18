import { createDefaultGameAccelConfig, GAME_ACCEL_CONFIG_VERSION } from './constants'
import type {
  DirectEntry,
  GameAccelConfig,
  GameAccelGuardConfig,
  GameAccelRegion,
  GameAccelSessionConfig,
  GameAccelTuning,
  GameItem,
  GameSource,
  PlatformSetting
} from './types'

const GAME_SOURCES: GameSource[] = [
  'steam',
  'epic',
  'gog',
  'ubisoft',
  'ea',
  'battlenet',
  'xbox',
  'riot',
  'manual',
  'capture'
]

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizePolicyMap(value: unknown): Record<string, 'follow' | 'direct'> | undefined {
  const entries = Object.entries(asRecord(value)).filter(
    ([, policy]) => policy === 'follow' || policy === 'direct'
  )
  return entries.length
    ? (Object.fromEntries(entries) as Record<string, 'follow' | 'direct'>)
    : undefined
}

function normalizeGameItem(value: unknown): GameItem | null {
  const raw = asRecord(value)
  const id = asString(raw.id).trim()
  if (!id) return null

  const match = asRecord(raw.match)
  const source = GAME_SOURCES.includes(raw.source as GameSource)
    ? (raw.source as GameSource)
    : 'manual'
  const fakeIpFilter = asStringArray(raw.fakeIpFilter)
  const antiCheat = normalizePolicyMap(raw.antiCheat)

  return {
    id,
    name: asString(raw.name, id),
    source,
    ...(typeof raw.sourceId === 'string' ? { sourceId: raw.sourceId } : {}),
    enable: asBoolean(raw.enable, true),
    match: {
      directories: asStringArray(match.directories),
      processNames: asStringArray(match.processNames),
      processPaths: asStringArray(match.processPaths),
      domains: asStringArray(match.domains),
      ipCidrs: asStringArray(match.ipCidrs)
    },
    policy: asString(raw.policy, 'inherit') || 'inherit',
    routeMode: raw.routeMode === 'global' ? 'global' : 'process',
    ...(antiCheat ? { antiCheat } : {}),
    ...(typeof raw.testUrl === 'string' ? { testUrl: raw.testUrl } : {}),
    ...(fakeIpFilter.length ? { fakeIpFilter } : {}),
    ...(typeof raw.icon === 'string' ? { icon: raw.icon } : {}),
    createdAt: asNumber(raw.createdAt, Date.now()),
    updatedAt: asNumber(raw.updatedAt, Date.now())
  }
}

function normalizePlatformSetting(value: unknown): PlatformSetting {
  const raw = asRecord(value)
  return {
    enable: asBoolean(raw.enable, false),
    extraDownload: asStringArray(raw.extraDownload),
    extraDownloadKeyword: asStringArray(raw.extraDownloadKeyword),
    extraPlatform: asStringArray(raw.extraPlatform),
    removed: asStringArray(raw.removed),
    ...(typeof raw.downloadViaProxy === 'boolean' ? { downloadViaProxy: raw.downloadViaProxy } : {})
  }
}

function normalizeRegion(value: unknown): GameAccelRegion | null {
  const raw = asRecord(value)
  const name = asString(raw.name).trim()
  if (!name) return null
  return {
    name,
    filter: asString(raw.filter).trim(),
    enable: asBoolean(raw.enable, true)
  }
}

function normalizeDirectEntry(value: unknown): DirectEntry | null {
  const raw = asRecord(value)
  const entryValue = asString(raw.value).trim()
  if (!entryValue) return null
  return {
    value: entryValue,
    kind: raw.kind === 'cidr' ? 'cidr' : 'domain',
    origin: raw.origin === 'guard' ? 'guard' : 'user',
    addedAt: asNumber(raw.addedAt, Date.now()),
    ...(typeof raw.note === 'string' ? { note: raw.note } : {})
  }
}

function normalizeTuning(value: unknown): Partial<GameAccelTuning> {
  const raw = asRecord(value)
  return {
    ...(typeof raw.endpointIndependentNat === 'boolean'
      ? { endpointIndependentNat: raw.endpointIndependentNat }
      : {}),
    ...(typeof raw.udpTimeout === 'number' && Number.isFinite(raw.udpTimeout)
      ? { udpTimeout: raw.udpTimeout }
      : {}),
    ...(typeof raw.excludeProxyServerIps === 'boolean'
      ? { excludeProxyServerIps: raw.excludeProxyServerIps }
      : {}),
    ...(typeof raw.fixFindProcessMode === 'boolean'
      ? { fixFindProcessMode: raw.fixFindProcessMode }
      : {}),
    ...(typeof raw.gameFakeIpFilter === 'boolean'
      ? { gameFakeIpFilter: raw.gameFakeIpFilter }
      : {}),
    ...(typeof raw.downloadDns === 'boolean' ? { downloadDns: raw.downloadDns } : {}),
    ...(typeof raw.ensureSniffer === 'boolean' ? { ensureSniffer: raw.ensureSniffer } : {}),
    ...(typeof raw.useRuleProviders === 'boolean' ? { useRuleProviders: raw.useRuleProviders } : {})
  }
}

function normalizeGuard(value: unknown): Partial<GameAccelGuardConfig> {
  const raw = asRecord(value)
  return {
    ...(typeof raw.enable === 'boolean' ? { enable: raw.enable } : {}),
    ...(typeof raw.totalThresholdMB === 'number' ? { totalThresholdMB: raw.totalThresholdMB } : {}),
    ...(typeof raw.speedThresholdMBps === 'number'
      ? { speedThresholdMBps: raw.speedThresholdMBps }
      : {}),
    ...(typeof raw.speedDurationSec === 'number' ? { speedDurationSec: raw.speedDurationSec } : {}),
    ...(typeof raw.cooldownMin === 'number' ? { cooldownMin: raw.cooldownMin } : {}),
    ...(typeof raw.autoDirect === 'boolean' ? { autoDirect: raw.autoDirect } : {}),
    ignored: asStringArray(raw.ignored)
  }
}

function normalizeSession(value: unknown): Partial<GameAccelSessionConfig> {
  const raw = asRecord(value)
  return typeof raw.protect === 'boolean' ? { protect: raw.protect } : {}
}

function normalizePendingGlobalRestore(
  value: unknown
): GameAccelConfig['pendingGlobalRestore'] | undefined {
  const raw = asRecord(value)
  const mode = raw.mode
  const global = asString(raw.global).trim()
  const gameId = asString(raw.gameId).trim()
  if ((mode === 'rule' || mode === 'global' || mode === 'direct') && global && gameId) {
    return { mode, global, gameId }
  }
  return undefined
}

export function migrateGameAccelConfig(value: unknown): GameAccelConfig {
  const base = createDefaultGameAccelConfig()
  const raw = asRecord(value)
  const groupNames = asRecord(raw.groupNames)
  const antiCheatPolicy = normalizePolicyMap(raw.antiCheatPolicy)
  const pendingGlobalRestore = normalizePendingGlobalRestore(raw.pendingGlobalRestore)

  const config: GameAccelConfig = {
    version: GAME_ACCEL_CONFIG_VERSION,
    enable: asBoolean(raw.enable, base.enable),
    mode: raw.mode === 'exclusive' ? 'exclusive' : 'overlay',
    downloadViaProxy: asBoolean(raw.downloadViaProxy, base.downloadViaProxy),
    groupNames: {
      game: asString(groupNames.game, base.groupNames.game),
      platform: asString(groupNames.platform, base.groupNames.platform),
      download: asString(groupNames.download, base.groupNames.download),
      regionPrefix: asString(groupNames.regionPrefix, base.groupNames.regionPrefix)
    },
    ...(typeof raw.platformUpstream === 'string' ? { platformUpstream: raw.platformUpstream } : {}),
    regions: Array.isArray(raw.regions)
      ? raw.regions.map(normalizeRegion).filter((region): region is GameAccelRegion => !!region)
      : [],
    platforms: Object.fromEntries(
      Object.entries(asRecord(raw.platforms)).map(([id, setting]) => [
        id,
        normalizePlatformSetting(setting)
      ])
    ),
    antiCheat: asBoolean(raw.antiCheat, base.antiCheat),
    ...(antiCheatPolicy ? { antiCheatPolicy } : {}),
    customDirect: Array.isArray(raw.customDirect)
      ? raw.customDirect.map(normalizeDirectEntry).filter((entry): entry is DirectEntry => !!entry)
      : [],
    customProxy: asStringArray(raw.customProxy),
    games: Array.isArray(raw.games)
      ? raw.games.map(normalizeGameItem).filter((game): game is GameItem => !!game)
      : [],
    ...(pendingGlobalRestore ? { pendingGlobalRestore } : {}),
    tuning: { ...base.tuning, ...normalizeTuning(raw.tuning) },
    guard: { ...base.guard, ...normalizeGuard(raw.guard) },
    session: { ...base.session, ...normalizeSession(raw.session) }
  }

  config.games = config.games.map((game) => ({
    ...game,
    antiCheat: game.antiCheat ?? config.antiCheatPolicy
  }))
  return config
}
