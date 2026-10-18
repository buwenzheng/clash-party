import { isIP } from 'node:net'
import { GAME_ACCEL_DEFAULT_TEST_URL } from '../../shared/game/constants'
import {
  directoryToProcessPathRegex,
  isValidCidr,
  isValidGroupName,
  isValidProcessName,
  isValidProcessPath,
  normalizeDomain
} from '../../shared/game/rule-utils'
import type {
  AntiCheatPreset,
  GameAccelConfig,
  GameAccelDiagnostic,
  GameItem,
  GeneratedRuleLayer,
  GeneratedSummary,
  PlatformPreset
} from '../../shared/game/types'
import { mergePlatformPreset } from './presets'

interface MihomoProxy {
  name: string
  type: string
  udp?: boolean
  server?: string | number
}

interface MihomoProxyGroup {
  name: string
  type: string
  proxies?: string[]
  use?: string[]
  filter?: string
  url?: string
  interval?: number
  lazy?: boolean
  tolerance?: number
  'include-all-proxies'?: boolean
  'exclude-type'?: string
  'default-selected'?: string
}

type GameAccelProfile = Omit<IMihomoConfig, 'proxies' | 'proxy-groups' | 'rules'> & {
  proxies?: MihomoProxy[]
  'proxy-groups'?: MihomoProxyGroup[]
  rules?: string[]
}

export interface CompileGameAccelInput {
  profile: IMihomoConfig
  config: GameAccelConfig
  presets: PlatformPreset[]
  antiCheatPreset: AntiCheatPreset
  platform: string
}

export interface CompileGameAccelResult {
  profile: IMihomoConfig
  summary: GeneratedSummary
  diagnostics: GameAccelDiagnostic[]
}

interface CompileContext {
  gameGroup: string
  platformGroup: string
  downloadGroup: string
  regionGroups: { name: string; filter: string }[]
  platformUpstream: string
  enabledPresets: PlatformPreset[]
  proxyNames: Set<string>
  proxyGroupNames: Set<string>
  antiCheatPreset: AntiCheatPreset
}

const LAN_RULES = [
  'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
  'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
  'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR6,::1/128,DIRECT,no-resolve',
  'IP-CIDR6,fe80::/10,DIRECT,no-resolve',
  'IP-CIDR6,fc00::/7,DIRECT,no-resolve',
  'DOMAIN-SUFFIX,local,DIRECT',
  'DOMAIN-SUFFIX,localhost,DIRECT'
]

const KNOWN_GEOSITE = new Set([
  'steam',
  'steam@cn',
  'epicgames',
  'ea',
  'ubisoft',
  'gog',
  'xbox',
  'battlenet',
  'riot',
  'category-games'
])

function emptySummary(): GeneratedSummary {
  return {
    groupNames: { game: '', platform: '', download: '' },
    groups: [],
    rules: [],
    ruleProviders: [],
    tunPatches: []
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function cloneProfile(profile: IMihomoConfig): IMihomoConfig {
  return structuredClone(profile)
}

function sanitizeGroupName(
  value: string,
  fallback: string,
  diagnostics: GameAccelDiagnostic[]
): string {
  const name = value.trim()
  if (isValidGroupName(name)) return name
  diagnostics.push({
    level: 'warning',
    code: 'GROUP_NAME_INVALID',
    message: 'Game acceleration group name is invalid, using fallback',
    params: { value, fallback }
  })
  return fallback
}

function ensureUniqueName(base: string, used: Set<string>): string {
  let name = base
  let index = 2
  while (used.has(name)) {
    name = `${base} ${index++}`
  }
  used.add(name)
  return name
}

function detectPlatformUpstream(
  profile: GameAccelProfile,
  config: GameAccelConfig,
  diagnostics: GameAccelDiagnostic[]
): string {
  const groups = profile['proxy-groups'] ?? []
  const proxies = profile.proxies ?? []
  const names = new Set([
    ...groups.map((group) => group.name),
    ...proxies.map((proxy) => proxy.name)
  ])

  if (config.platformUpstream) {
    if (names.has(config.platformUpstream)) return config.platformUpstream
    diagnostics.push({
      level: 'warning',
      code: 'PLATFORM_UPSTREAM_NOT_FOUND',
      message: 'Configured platform upstream does not exist, falling back',
      params: { name: config.platformUpstream }
    })
  }

  const matchRule = (profile.rules ?? []).find(
    (rule) => typeof rule === 'string' && rule.startsWith('MATCH,')
  )
  if (matchRule) {
    const target = matchRule.split(',')[1]?.trim()
    if (target && names.has(target)) return target
  }

  const preferred = groups.find(
    (group) => group.type === 'select' && /节点选择|代理|Proxy|PROXY|🚀/.test(group.name)
  )
  if (preferred) return preferred.name

  const firstSelect = groups.find((group) => group.type === 'select')
  if (firstSelect) return firstSelect.name

  diagnostics.push({
    level: 'warning',
    code: 'PLATFORM_UPSTREAM_NOT_FOUND',
    message: 'No subscription proxy group found, platform group falls back to DIRECT'
  })
  return 'DIRECT'
}

function regionHasMatches(
  filter: string,
  profile: GameAccelProfile,
  diagnostics: GameAccelDiagnostic[]
): boolean {
  if (!filter.trim()) return true
  const pattern = filter.trim().replace(/^\(\?i\)/, '')
  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'i')
  } catch {
    diagnostics.push({
      level: 'warning',
      code: 'REGION_FILTER_INVALID',
      message: 'Region filter is not a valid regular expression, skipping the region',
      params: { filter }
    })
    return false
  }
  // Provider nodes are only known at runtime; keep the region group and let mihomo apply
  // the filter instead of incorrectly reporting the region as empty.
  if (getProxyProviders(profile).length > 0) return true
  const names = [
    ...(profile.proxies ?? []).map((proxy) => proxy.name),
    ...(profile['proxy-groups'] ?? []).map((group) => group.name)
  ]
  return names.some((name) => regex.test(name))
}

function buildContext(
  profile: GameAccelProfile,
  config: GameAccelConfig,
  presets: PlatformPreset[],
  antiCheatPreset: AntiCheatPreset,
  diagnostics: GameAccelDiagnostic[]
): CompileContext {
  const groups = profile['proxy-groups'] ?? []
  const proxies = profile.proxies ?? []
  const usedNames = new Set([
    ...groups.map((group) => group.name),
    ...proxies.map((proxy) => proxy.name)
  ])

  const gameGroup = ensureUniqueName(
    sanitizeGroupName(config.groupNames.game, '🎮 游戏加速', diagnostics),
    usedNames
  )
  const platformGroup = ensureUniqueName(
    sanitizeGroupName(config.groupNames.platform, '🌐 游戏平台', diagnostics),
    usedNames
  )
  const downloadGroup = ensureUniqueName(
    sanitizeGroupName(config.groupNames.download, '⬇️ 游戏下载', diagnostics),
    usedNames
  )
  const platformUpstream = detectPlatformUpstream(profile, config, diagnostics)

  const enabledPresets = Object.entries(config.platforms)
    .filter(([, setting]) => setting.enable)
    .flatMap(([id, setting]) => {
      const preset = presets.find((item) => item.id === id)
      if (!preset) {
        diagnostics.push({
          level: 'warning',
          code: 'PLATFORM_PRESET_MISSING',
          message: 'Platform preset is missing, skipping',
          params: { platform: id }
        })
        return []
      }
      return [mergePlatformPreset(preset, setting)]
    })

  const regionGroups = config.regions
    .filter((region) => region.enable)
    .flatMap((region) => {
      if (!regionHasMatches(region.filter, profile, diagnostics)) {
        diagnostics.push({
          level: 'warning',
          code: 'REGION_EMPTY',
          message: 'Region has no matching proxy, skipping group',
          params: { region: region.name }
        })
        return []
      }
      const name = ensureUniqueName(
        sanitizeGroupName(
          `${config.groupNames.regionPrefix}${region.name}`,
          `🎮 区域·${region.name}`,
          diagnostics
        ),
        usedNames
      )
      return [{ name, filter: region.filter }]
    })

  return {
    gameGroup,
    platformGroup,
    downloadGroup,
    regionGroups,
    platformUpstream,
    enabledPresets,
    proxyNames: new Set(proxies.map((proxy) => proxy.name)),
    proxyGroupNames: new Set(groups.map((group) => group.name)),
    antiCheatPreset
  }
}

function isUdpCapable(proxy: MihomoProxy): boolean {
  return proxy.udp === true || ['hysteria', 'hysteria2', 'tuic', 'wireguard'].includes(proxy.type)
}

function getProxyProviders(profile: GameAccelProfile): string[] {
  const providers = (profile as unknown as Record<string, unknown>)['proxy-providers']
  return providers && typeof providers === 'object' && !Array.isArray(providers)
    ? Object.keys(providers)
    : []
}

function buildGroups(
  profile: GameAccelProfile,
  config: GameAccelConfig,
  context: CompileContext
): MihomoProxyGroup[] {
  const groups: MihomoProxyGroup[] = []
  const providerNames = getProxyProviders(profile)

  for (const region of context.regionGroups) {
    groups.push({
      name: region.name,
      type: 'url-test',
      'include-all-proxies': true,
      ...(providerNames.length ? { use: providerNames } : {}),
      ...(region.filter ? { filter: region.filter } : {}),
      url: GAME_ACCEL_DEFAULT_TEST_URL,
      lazy: true,
      interval: 0,
      tolerance: 30
    })
  }

  const udpProxyNames = (profile.proxies ?? []).filter(isUdpCapable).map((proxy) => proxy.name)
  const regionNames = context.regionGroups.map((region) => region.name)
  const gameProxies = unique([...regionNames, ...udpProxyNames, context.platformUpstream, 'DIRECT'])
  const hasStaticProxies = (profile.proxies ?? []).length > 0
  const defaultGameSelected =
    providerNames.length > 0 && !hasStaticProxies
      ? context.platformUpstream
      : (regionNames[0] ?? context.platformUpstream)

  groups.push({
    name: context.gameGroup,
    type: 'select',
    proxies: gameProxies,
    ...(providerNames.length ? { use: providerNames } : {}),
    'exclude-type': 'Http',
    'default-selected': defaultGameSelected
  })

  const platformProxies = unique([
    context.platformUpstream,
    context.gameGroup,
    ...[...context.proxyGroupNames].filter(
      (name) => name !== context.platformGroup && name !== context.downloadGroup
    ),
    ...context.proxyNames,
    'DIRECT'
  ])
  groups.push({
    name: context.platformGroup,
    type: 'select',
    proxies: platformProxies,
    ...(providerNames.length ? { use: providerNames } : {}),
    'default-selected': context.platformUpstream
  })

  groups.push({
    name: context.downloadGroup,
    type: 'select',
    proxies: config.downloadViaProxy ? unique(['DIRECT', context.platformGroup]) : ['DIRECT'],
    'default-selected': 'DIRECT'
  })

  return groups
}

function resolveGamePolicy(
  game: GameItem,
  context: CompileContext,
  diagnostics: GameAccelDiagnostic[]
): string {
  if (!game.policy || game.policy === 'inherit') return context.gameGroup
  if (game.policy === 'DIRECT') return 'DIRECT'
  if (/[\r\n,]/.test(game.policy)) {
    diagnostics.push({
      level: 'warning',
      code: 'GAME_POLICY_INVALID',
      message: 'Game policy name contains a comma or newline',
      params: { game: game.name, policy: game.policy }
    })
    return context.gameGroup
  }
  if (context.regionGroups.some((region) => region.name === game.policy)) {
    return game.policy
  }
  if (context.proxyNames.has(game.policy) || context.proxyGroupNames.has(game.policy)) {
    return game.policy
  }
  diagnostics.push({
    level: 'warning',
    code: 'GAME_POLICY_NOT_FOUND',
    message: 'Game policy target does not exist, falling back to game group',
    params: { game: game.name, policy: game.policy }
  })
  return context.gameGroup
}

function buildGeositeRule(
  category: string,
  policy: string,
  diagnostics: GameAccelDiagnostic[]
): string | null {
  if (!KNOWN_GEOSITE.has(category)) {
    diagnostics.push({
      level: 'warning',
      code: 'GEOSITE_MISSING',
      message: 'GEOSITE category is not in the built-in allowlist',
      params: { category }
    })
    return null
  }
  return `GEOSITE,${category},${policy}`
}

function buildRules(
  config: GameAccelConfig,
  context: CompileContext,
  platform: string,
  diagnostics: GameAccelDiagnostic[],
  summary: GeneratedSummary
): string[] {
  const rules: string[] = []
  const seen = new Set<string>()
  const add = (rule: string, layer: GeneratedRuleLayer, ref?: string): void => {
    if (!rule || seen.has(rule)) return
    seen.add(rule)
    rules.push(rule)
    summary.rules.push({ rule, layer, ref })
  }

  const policyCache = new Map<string, string>()
  const gamePolicy = (game: GameItem): string => {
    const cached = policyCache.get(game.id)
    if (cached !== undefined) return cached
    const policy = resolveGamePolicy(game, context, diagnostics)
    policyCache.set(game.id, policy)
    return policy
  }

  for (const rule of LAN_RULES) add(rule, 'lan')

  for (const entry of config.customDirect) {
    if (entry.kind === 'cidr') {
      if (!isValidCidr(entry.value)) {
        diagnostics.push({
          level: 'warning',
          code: 'CUSTOM_DIRECT_INVALID',
          message: 'Invalid custom direct CIDR',
          params: { value: entry.value }
        })
        continue
      }
      add(
        `${entry.value.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'},${entry.value},DIRECT,no-resolve`,
        'customDirect'
      )
    } else {
      const domain = normalizeDomain(entry.value)
      if (!domain) {
        diagnostics.push({
          level: 'warning',
          code: 'CUSTOM_DIRECT_INVALID',
          message: 'Invalid custom direct domain',
          params: { value: entry.value }
        })
        continue
      }
      add(`DOMAIN-SUFFIX,${domain},DIRECT`, 'customDirect')
    }
  }

  for (const preset of context.enabledPresets) {
    for (const category of preset.download.geosite ?? []) {
      const rule = buildGeositeRule(category, context.downloadGroup, diagnostics)
      if (rule) add(rule, 'download', preset.id)
    }
    for (const domain of preset.download.domain ?? []) {
      add(`DOMAIN,${domain},${context.downloadGroup}`, 'download', preset.id)
    }
    for (const suffix of preset.download.domainSuffix ?? []) {
      add(`DOMAIN-SUFFIX,${suffix},${context.downloadGroup}`, 'download', preset.id)
    }
    for (const keyword of preset.download.domainKeyword ?? []) {
      add(`DOMAIN-KEYWORD,${keyword},${context.downloadGroup}`, 'download', preset.id)
    }
    for (const domain of preset.clientUpdate ?? []) {
      add(`DOMAIN,${domain},${context.downloadGroup}`, 'download', preset.id)
    }
    for (const cidr of preset.download.ipCidr ?? []) {
      add(
        `${cidr.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'},${cidr},${context.downloadGroup},no-resolve`,
        'download',
        preset.id
      )
    }
  }

  for (const value of config.customProxy) {
    if (isValidCidr(value)) {
      add(
        `${value.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'},${value},${context.platformGroup},no-resolve`,
        'customProxy'
      )
      continue
    }
    const domain = normalizeDomain(value)
    if (!domain) {
      diagnostics.push({
        level: 'warning',
        code: 'CUSTOM_PROXY_INVALID',
        message: 'Invalid custom proxy domain',
        params: { value }
      })
      continue
    }
    add(`DOMAIN-SUFFIX,${domain},${context.platformGroup}`, 'customProxy')
  }

  for (const game of config.games.filter((item) => item.enable)) {
    const policy = gamePolicy(game)
    for (const domain of game.match.domains) {
      const normalized = normalizeDomain(domain)
      if (!normalized) {
        diagnostics.push({
          level: 'warning',
          code: 'GAME_DOMAIN_INVALID',
          message: 'Invalid game domain',
          params: { game: game.name, domain }
        })
        continue
      }
      add(`DOMAIN-SUFFIX,${normalized},${policy}`, 'gameDomain', game.id)
    }
  }

  for (const preset of context.enabledPresets) {
    for (const domain of preset.platform.domain ?? []) {
      add(`DOMAIN,${domain},${context.platformGroup}`, 'platformWhitelist', preset.id)
    }
    for (const suffix of preset.platform.domainSuffix ?? []) {
      add(`DOMAIN-SUFFIX,${suffix},${context.platformGroup}`, 'platformWhitelist', preset.id)
    }
    for (const keyword of preset.platform.domainKeyword ?? []) {
      add(`DOMAIN-KEYWORD,${keyword},${context.platformGroup}`, 'platformWhitelist', preset.id)
    }
    for (const cidr of preset.platform.ipCidr ?? []) {
      add(
        `${cidr.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'},${cidr},${context.platformGroup},no-resolve`,
        'platformWhitelist',
        preset.id
      )
    }
  }

  for (const game of config.games.filter((item) => item.enable)) {
    const policy = gamePolicy(game)
    for (const path of game.match.processPaths) {
      if (!isValidProcessPath(path)) {
        diagnostics.push({
          level: 'warning',
          code: 'GAME_PATH_INVALID',
          message: 'Invalid game process path',
          params: { game: game.name, path }
        })
        continue
      }
      add(`PROCESS-PATH,${path},${policy}`, 'game', game.id)
    }
    for (const name of game.match.processNames) {
      if (!isValidProcessName(name)) {
        diagnostics.push({
          level: 'warning',
          code: 'GAME_PROCESS_INVALID',
          message: 'Invalid game process name',
          params: { game: game.name, name }
        })
        continue
      }
      add(`PROCESS-NAME,${name},${policy}`, 'game', game.id)
    }
    for (const directory of game.match.directories) {
      if (!isValidProcessPath(directory)) {
        diagnostics.push({
          level: 'warning',
          code: 'GAME_DIRECTORY_INVALID',
          message: 'Invalid game installation directory',
          params: { game: game.name, directory }
        })
        continue
      }
      add(
        `PROCESS-PATH-REGEX,${directoryToProcessPathRegex(directory, platform)},${policy}`,
        'game',
        game.id
      )
    }
    for (const cidr of game.match.ipCidrs) {
      if (!isValidCidr(cidr)) {
        diagnostics.push({
          level: 'warning',
          code: 'GAME_CIDR_INVALID',
          message: 'Invalid game CIDR',
          params: { game: game.name, cidr }
        })
        continue
      }
      add(
        `${cidr.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'},${cidr},${policy},no-resolve`,
        'game',
        game.id
      )
    }
  }

  if (config.antiCheat) {
    const mapping = new Map<string, 'follow' | 'direct'>()
    for (const entry of context.antiCheatPreset.entries) mapping.set(entry.process, entry.policy)
    for (const [process, policy] of Object.entries(config.antiCheatPolicy ?? {})) {
      mapping.set(process, policy)
    }
    for (const preset of context.enabledPresets) {
      for (const entry of preset.antiCheat ?? []) mapping.set(entry.process, entry.policy)
    }
    for (const game of config.games.filter((item) => item.enable)) {
      for (const [process, policy] of Object.entries(game.antiCheat ?? {})) {
        mapping.set(process, policy)
      }
    }
    for (const [process, policy] of mapping) {
      if (!isValidProcessName(process)) {
        diagnostics.push({
          level: 'warning',
          code: 'ANTI_CHEAT_PROCESS_INVALID',
          message: 'Invalid anti-cheat process name',
          params: { process }
        })
        continue
      }
      add(
        `PROCESS-NAME,${process},${policy === 'direct' ? 'DIRECT' : context.gameGroup}`,
        'antiCheat',
        process
      )
    }
  }

  for (const preset of context.enabledPresets) {
    for (const port of preset.clientPorts ?? []) {
      if (!isValidProcessName(port.process) || !port.ports.trim()) continue
      const network = port.network === 'udp' ? 'UDP' : 'TCP'
      add(
        `AND,((NETWORK,${network}),(PROCESS-NAME,${port.process}),(DST-PORT,${port.ports})),${context.platformGroup}`,
        'clientPort',
        preset.id
      )
    }
  }

  for (const preset of context.enabledPresets) {
    if (preset.mixedDomainFallback !== 'direct') continue
    for (const domain of preset.mixedDomains ?? []) {
      const normalized = normalizeDomain(domain)
      if (!normalized) continue
      add(`DOMAIN-SUFFIX,${normalized},DIRECT`, 'platformFallback', preset.id)
    }
  }

  for (const preset of context.enabledPresets) {
    for (const category of preset.platform.geosite ?? []) {
      const rule = buildGeositeRule(category, context.platformGroup, diagnostics)
      if (rule) add(rule, 'platformGeosite', preset.id)
    }
  }

  return rules
}

function applyTunDnsPatches(
  profile: GameAccelProfile,
  config: GameAccelConfig,
  context: CompileContext,
  summary: GeneratedSummary
): void {
  const patches = new Set<string>()

  if (profile.tun?.enable) {
    if (config.tuning.endpointIndependentNat) {
      profile.tun['endpoint-independent-nat'] = true
      patches.add('endpoint-independent-nat')
    }
    if (config.tuning.udpTimeout) {
      profile.tun['udp-timeout'] = config.tuning.udpTimeout
      patches.add('udp-timeout')
    }
    if (config.tuning.excludeProxyServerIps) {
      const routeExcludeAddress = Array.isArray(profile.tun['route-exclude-address'])
        ? [...profile.tun['route-exclude-address']]
        : []
      const existing = new Set(routeExcludeAddress.map((address) => address.toLowerCase()))
      for (const proxy of profile.proxies ?? []) {
        if (typeof proxy.server !== 'string' && typeof proxy.server !== 'number') continue
        const host = String(proxy.server)
          .trim()
          .replace(/^\[(.*)\]$/, '$1')
          .toLowerCase()
        const version = isIP(host)
        if (!version) continue
        const cidr = version === 4 ? `${host}/32` : `${host}/128`
        if (existing.has(host) || existing.has(cidr)) continue
        routeExcludeAddress.push(cidr)
        existing.add(cidr)
        patches.add(`route-exclude:${cidr}`)
      }
      profile.tun['route-exclude-address'] = routeExcludeAddress
    }
  }

  if (config.tuning.fixFindProcessMode && profile['find-process-mode'] === 'off') {
    profile['find-process-mode'] = 'strict'
    patches.add('find-process-mode')
  }

  if (config.tuning.ensureSniffer) {
    profile.sniffer = profile.sniffer ?? {}
    profile.sniffer.enable = true
    const sniff = profile.sniffer.sniff ?? {}
    profile.sniffer.sniff = sniff
    const ensurePort = (protocol: 'HTTP' | 'TLS' | 'QUIC', port: number): void => {
      const entry = sniff[protocol] ?? { ports: [] }
      const ports = Array.isArray(entry.ports) ? entry.ports : []
      if (!ports.includes(port)) ports.push(port)
      entry.ports = ports
      sniff[protocol] = entry
    }
    ensurePort('HTTP', 80)
    ensurePort('TLS', 443)
    patches.add('sniffer')
  }

  if (config.tuning.downloadDns) {
    profile.dns = profile.dns ?? {}
    const downloadDomains = new Set<string>()
    for (const preset of context.enabledPresets) {
      for (const suffix of preset.download.domainSuffix ?? []) {
        downloadDomains.add(`+.${suffix}`)
      }
      for (const domain of preset.download.domain ?? []) downloadDomains.add(domain)
      for (const domain of preset.clientUpdate ?? []) downloadDomains.add(domain)
    }
    if (downloadDomains.size) {
      const policy = { ...(profile.dns['nameserver-policy'] ?? {}) }
      const localDns =
        profile.dns['direct-nameserver']?.[0] ??
        profile.dns.nameserver?.[0] ??
        profile.dns['default-nameserver']?.[0] ??
        'https://doh.pub/dns-query'
      for (const domain of downloadDomains) {
        if (!policy[domain]) policy[domain] = localDns
      }
      profile.dns['nameserver-policy'] = policy
      patches.add('download-dns')
    }
  }

  if (config.tuning.gameFakeIpFilter) {
    profile.dns = profile.dns ?? {}
    const filters = new Set(profile.dns['fake-ip-filter'] ?? [])
    for (const preset of context.enabledPresets) {
      for (const domain of preset.fakeIpFilter ?? []) filters.add(domain)
    }
    for (const game of config.games.filter((item) => item.enable)) {
      for (const domain of game.fakeIpFilter ?? []) filters.add(domain)
    }
    if (filters.size) {
      profile.dns['fake-ip-filter'] = [...filters]
      patches.add('fake-ip-filter')
    }
  }

  summary.tunPatches = [...patches]
}

export function compileGameAccel(input: CompileGameAccelInput): CompileGameAccelResult {
  const empty = emptySummary()
  if (!input.config.enable) {
    return { profile: cloneProfile(input.profile), summary: empty, diagnostics: [] }
  }

  const diagnostics: GameAccelDiagnostic[] = []
  const summary = emptySummary()
  const originalProfile = cloneProfile(input.profile)

  try {
    const profile = cloneProfile(input.profile) as unknown as GameAccelProfile
    const originalRules = Array.isArray(input.profile.rules)
      ? [...(input.profile.rules as unknown as string[])]
      : []
    const context = buildContext(
      profile,
      input.config,
      input.presets,
      input.antiCheatPreset,
      diagnostics
    )
    const groups = buildGroups(profile, input.config, context)
    summary.groupNames = {
      game: context.gameGroup,
      platform: context.platformGroup,
      download: context.downloadGroup
    }
    summary.groups = groups.map((group) => group.name)
    const rules = buildRules(input.config, context, input.platform, diagnostics, summary)

    const existingGroups = profile['proxy-groups'] ?? []
    profile['proxy-groups'] = [...existingGroups, ...groups]
    profile.rules =
      input.config.mode === 'exclusive' ? [...rules, 'MATCH,DIRECT'] : [...rules, ...originalRules]

    applyTunDnsPatches(profile, input.config, context, summary)

    return {
      profile: profile as unknown as IMihomoConfig,
      summary,
      diagnostics
    }
  } catch (error) {
    diagnostics.push({
      level: 'error',
      code: 'COMPILE_FAILED',
      message: 'Game acceleration compile failed, keeping the original profile',
      params: { error: error instanceof Error ? error.message : String(error) }
    })
    return { profile: originalProfile, summary: emptySummary(), diagnostics }
  }
}
