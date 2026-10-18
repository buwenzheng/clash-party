export type GameAccelMode = 'overlay' | 'exclusive'

export type GameSource =
  'steam' | 'epic' | 'gog' | 'ubisoft' | 'ea' | 'battlenet' | 'xbox' | 'riot' | 'manual' | 'capture'

/** 'inherit' 表示使用游戏加速组；其余为策略组名、节点名或 'DIRECT'。 */
export type GamePolicy = 'inherit' | string

export interface GameMatch {
  directories: string[]
  processNames: string[]
  processPaths: string[]
  domains: string[]
  ipCidrs: string[]
}

export interface GameItem {
  id: string
  name: string
  source: GameSource
  sourceId?: string
  enable: boolean
  match: GameMatch
  policy: GamePolicy
  routeMode: 'process' | 'global'
  antiCheat?: Record<string, 'follow' | 'direct'>
  testUrl?: string
  fakeIpFilter?: string[]
  icon?: string
  createdAt: number
  updatedAt: number
}

export interface PlatformSetting {
  enable: boolean
  extraDownload: string[]
  extraDownloadKeyword: string[]
  extraPlatform: string[]
  removed: string[]
  downloadViaProxy?: boolean
}

export interface DirectEntry {
  value: string
  kind: 'domain' | 'cidr'
  origin: 'user' | 'guard'
  addedAt: number
  note?: string
}

export interface RuleSource {
  geosite?: string[]
  domain?: string[]
  domainSuffix?: string[]
  domainKeyword?: string[]
  ipCidr?: string[]
}

export interface PlatformPreset {
  id: string
  name: string
  version: string
  updatedAt?: number
  source?: 'builtin' | 'remote'
  download: RuleSource
  platform: RuleSource
  mixedDomains?: string[]
  mixedDomainFallback?: 'direct' | 'rules'
  clientUpdate?: string[]
  clientProcesses: string[]
  clientPorts?: { process: string; ports: string; network?: 'tcp' | 'udp' }[]
  antiCheat?: { process: string; policy: 'follow' | 'direct' }[]
  fakeIpFilter?: string[]
  tips?: string[]
}

export interface AntiCheatPreset {
  version: string
  entries: { process: string; policy: 'follow' | 'direct' }[]
}

export interface GameAccelTuning {
  endpointIndependentNat: boolean
  udpTimeout?: number
  excludeProxyServerIps: boolean
  fixFindProcessMode: boolean
  gameFakeIpFilter: boolean
  downloadDns: boolean
  ensureSniffer: boolean
  useRuleProviders: boolean
}

export interface GameAccelGuardConfig {
  enable: boolean
  totalThresholdMB: number
  speedThresholdMBps: number
  speedDurationSec: number
  cooldownMin: number
  autoDirect: boolean
  ignored: string[]
}

export interface GameAccelSessionConfig {
  protect: boolean
}

export interface GameAccelRegion {
  name: string
  filter: string
  enable: boolean
}

export interface GameAccelGroupNames {
  game: string
  platform: string
  download: string
  regionPrefix: string
}

export interface GameAccelConfig {
  version: 1
  enable: boolean
  mode: GameAccelMode
  downloadViaProxy: boolean
  groupNames: GameAccelGroupNames
  platformUpstream?: string
  regions: GameAccelRegion[]
  platforms: Record<string, PlatformSetting>
  antiCheat: boolean
  antiCheatPolicy?: Record<string, 'follow' | 'direct'>
  customDirect: DirectEntry[]
  customProxy: string[]
  games: GameItem[]
  pendingGlobalRestore?: {
    mode: 'rule' | 'global' | 'direct'
    global: string
    gameId: string
  }
  tuning: GameAccelTuning
  guard: GameAccelGuardConfig
  session: GameAccelSessionConfig
}

export type GameAccelConfigPatch = Partial<GameAccelConfig>

export type GeneratedRuleLayer =
  | 'lan'
  | 'customDirect'
  | 'download'
  | 'customProxy'
  | 'gameDomain'
  | 'platformWhitelist'
  | 'game'
  | 'antiCheat'
  | 'clientPort'
  | 'platformFallback'
  | 'platformGeosite'

export interface GeneratedRule {
  rule: string
  layer: GeneratedRuleLayer
  ref?: string
}

export interface GeneratedSummary {
  groups: string[]
  rules: GeneratedRule[]
  ruleProviders: string[]
  tunPatches: string[]
}

export interface GameAccelDiagnostic {
  level: 'error' | 'warning' | 'info'
  code: string
  message: string
  params?: Record<string, string | number>
  fix?: string
}

export interface GameAccelState {
  enable: boolean
  config: GameAccelConfig
  lastCompile?: GeneratedSummary
  diagnostics: GameAccelDiagnostic[]
}

export interface GameAccelAddResult {
  game: GameItem
  duplicate: boolean
}

export interface GameCandidate {
  source: GameSource
  sourceId: string
  name: string
  directory: string
  executables: string[]
  icon?: string
  added: boolean
}

export interface CaptureProcess {
  process: string
  processPath: string
  connections: number
  udpRatio: number
  countries: string[]
  upload: number
  download: number
  firstSeen: number
  preexisting: boolean
  suggested: boolean
  suggestedRouteMode: 'process' | 'global'
}

export interface GuardAlert {
  id: string
  host: string
  process: string
  chain: string[]
  download: number
  speed: number
  layer: GeneratedRuleLayer | 'unknown'
  suggestedAction: 'direct' | 'proxy' | 'downloadMode'
  at: number
  handled?: 'direct' | 'proxy' | 'downloadMode' | 'ignored' | 'auto'
}

export interface GameAccelLiveState {
  updatedAt: number
  currentGame?: { id: string; name: string }
  connections: number
  upload: number
  download: number
  uploadSpeed: number
  downloadSpeed: number
  captureActive: boolean
  capture: CaptureProcess[]
  alerts: GuardAlert[]
}

export interface GameTrafficTop {
  host: string
  process: string
  connections: number
  upload: number
  download: number
  chain: string[]
}

export interface GameAccelPreview {
  yaml: string
  summary: GeneratedSummary
  diagnostics: GameAccelDiagnostic[]
}
