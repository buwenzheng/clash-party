import { describe, expect, it } from 'vitest'
import { createDefaultGameAccelConfig } from '../../shared/game/constants'
import type { GameAccelConfig } from '../../shared/game/types'
import { compileGameAccel } from './compiler'
import { getAntiCheatPreset, listBuiltinPresets } from './presets'

interface GroupLike {
  name: string
  proxies?: string[]
  'default-selected'?: string
  'include-all-proxies'?: boolean
  filter?: string
}

type MihomoConfig = Parameters<typeof compileGameAccel>[0]['profile']

const baseProfile = {
  'external-controller-pipe': '',
  'external-controller-unix': '',
  'external-controller': '',
  'external-ui': '',
  'external-ui-url': '',
  ipv6: false,
  mode: 'rule',
  'mixed-port': 7890,
  'allow-lan': false,
  'unified-delay': true,
  'tcp-concurrent': true,
  'log-level': 'info',
  'find-process-mode': 'strict',
  authentication: [],
  proxies: [
    { name: '香港 01', type: 'ss', udp: true, server: '1.1.1.1' },
    { name: '日本 01', type: 'ss', udp: false, server: '2.2.2.2' }
  ],
  'proxy-groups': [{ name: '节点选择', type: 'select', proxies: ['香港 01', '日本 01'] }],
  rules: ['MATCH,节点选择'],
  tun: { enable: true, stack: 'mixed' },
  dns: { enable: true, 'enhanced-mode': 'fake-ip', nameserver: ['223.5.5.5'] },
  sniffer: { enable: false },
  profile: { 'store-selected': true }
} as unknown as MihomoConfig

function createConfig(): GameAccelConfig {
  const config = createDefaultGameAccelConfig()
  config.enable = true
  config.regions = [{ name: '香港', filter: '香港|hk', enable: true }]
  config.platforms = {
    steam: {
      enable: true,
      extraDownload: [],
      extraDownloadKeyword: [],
      extraPlatform: [],
      removed: []
    },
    epic: {
      enable: true,
      extraDownload: [],
      extraDownloadKeyword: [],
      extraPlatform: [],
      removed: []
    }
  }
  config.games = [
    {
      id: 'apex',
      name: 'Apex Legends',
      source: 'steam',
      enable: true,
      match: {
        directories: ['D:\\Apex'],
        processNames: ['r5apex.exe'],
        processPaths: [],
        domains: ['apex.com'],
        ipCidrs: []
      },
      policy: 'inherit',
      routeMode: 'process',
      createdAt: 1,
      updatedAt: 1
    }
  ]
  return config
}

function compile(
  profile: MihomoConfig = baseProfile,
  config = createConfig()
): ReturnType<typeof compileGameAccel> {
  return compileGameAccel({
    profile,
    config,
    presets: listBuiltinPresets(),
    antiCheatPreset: getAntiCheatPreset(),
    platform: 'win32'
  })
}

function ruleIndex(rules: string[], value: string): number {
  return rules.findIndex((rule) => rule.includes(value))
}

describe('compileGameAccel', () => {
  it('returns the original profile when disabled', () => {
    const config = createConfig()
    config.enable = false
    const result = compile(baseProfile, config)
    expect(result.profile).toEqual(baseProfile)
    expect(result.summary.rules).toHaveLength(0)
  })

  it('creates groups and keeps the document rule order', () => {
    const result = compile()
    const rules = result.profile.rules as unknown as string[]
    const groups = result.profile['proxy-groups'] as unknown as GroupLike[]

    expect(rules[0]).toBe('IP-CIDR,10.0.0.0/8,DIRECT,no-resolve')
    expect(ruleIndex(rules, 'DOMAIN-SUFFIX,steamcontent.com')).toBeLessThan(
      ruleIndex(rules, 'DOMAIN-SUFFIX,steampowered.com')
    )
    expect(ruleIndex(rules, 'DOMAIN-SUFFIX,epicgames.com,DIRECT')).toBeLessThan(
      ruleIndex(rules, 'GEOSITE,epicgames,🌐 游戏平台')
    )
    const gameDomainIndex = ruleIndex(rules, 'DOMAIN-SUFFIX,apex.com')
    const platformIndex = ruleIndex(rules, 'DOMAIN-SUFFIX,steampowered.com')
    const gameProcessIndex = ruleIndex(rules, 'PROCESS-PATH-REGEX,(?i)^D:\\\\Apex\\\\')
    expect(gameDomainIndex).toBeLessThan(platformIndex)
    expect(platformIndex).toBeLessThan(gameProcessIndex)
    expect(ruleIndex(rules, 'AND,((NETWORK,TCP),(PROCESS-NAME,steam.exe)')).toBeGreaterThan(-1)
    expect(rules.at(-1)).toBe('MATCH,节点选择')

    expect(groups.some((group) => group.name === '🎮 游戏加速')).toBe(true)
    expect(groups.some((group) => group.name === '🌐 游戏平台')).toBe(true)
    expect(groups.some((group) => group.name === '⬇️ 游戏下载')).toBe(true)
    expect(groups.some((group) => group.name === '🎮 区域·香港')).toBe(true)
    expect(result.summary.groups).toEqual(
      expect.arrayContaining(['🎮 游戏加速', '🌐 游戏平台', '⬇️ 游戏下载', '🎮 区域·香港'])
    )
  })

  it('accepts a generated region group as a per-game policy', () => {
    const config = createConfig()
    config.games[0].policy = '🎮 区域·香港'
    const result = compile(baseProfile, config)
    const rules = result.profile.rules as unknown as string[]
    expect(rules).toContain('DOMAIN-SUFFIX,apex.com,🎮 区域·香港')
    expect(result.diagnostics.some((item) => item.code === 'GAME_POLICY_NOT_FOUND')).toBe(false)
  })

  it('rejects policy names containing rule separators', () => {
    const config = createConfig()
    config.games[0].policy = '节点,注入'
    const result = compile(baseProfile, config)
    const rules = result.profile.rules as unknown as string[]
    expect(result.diagnostics.some((item) => item.code === 'GAME_POLICY_INVALID')).toBe(true)
    expect(rules.some((rule) => rule.includes('节点,注入'))).toBe(false)
  })

  it('does not create a self-referencing group without an upstream', () => {
    const profile = {
      ...baseProfile,
      proxies: [],
      'proxy-groups': [],
      rules: ['MATCH,DIRECT']
    } as unknown as MihomoConfig
    const result = compile(profile)
    const groups = result.profile['proxy-groups'] as unknown as GroupLike[]
    const game = groups.find((group) => group.name === '🎮 游戏加速')
    const platform = groups.find((group) => group.name === '🌐 游戏平台')
    expect(game?.proxies).not.toContain('🎮 游戏加速')
    expect(platform?.proxies).toContain('DIRECT')
    expect(platform?.proxies).not.toContain('🌐 游戏平台')
  })

  it('keeps region groups for provider-only profiles', () => {
    const profile = {
      ...baseProfile,
      proxies: [],
      'proxy-groups': [],
      'proxy-providers': {
        demo: { type: 'http', url: 'https://example.com/provider.yaml' }
      },
      rules: ['MATCH,DIRECT']
    } as unknown as MihomoConfig
    const config = createConfig()
    config.regions = [{ name: '香港', filter: '香港|hk', enable: true }]
    const result = compile(profile, config)
    const groups = result.profile['proxy-groups'] as unknown as GroupLike[]
    const game = groups.find((group) => group.name === '🎮 游戏加速')
    expect(groups.some((group) => group.name === '🎮 区域·香港')).toBe(true)
    expect(result.diagnostics.some((item) => item.code === 'REGION_EMPTY')).toBe(false)
    expect(game?.['default-selected']).toBe('DIRECT')
  })

  it('uses a per-game node and exposes nodes on the platform group', () => {
    const config = createConfig()
    config.games[0].policy = '香港 01'
    const result = compile(baseProfile, config)
    const rules = result.profile.rules as unknown as string[]
    const groups = result.profile['proxy-groups'] as unknown as GroupLike[]
    const platform = groups.find((group) => group.name === '🌐 游戏平台')

    expect(rules).toContain('DOMAIN-SUFFIX,apex.com,香港 01')
    expect(rules).toContain('PROCESS-NAME,r5apex.exe,香港 01')
    expect(platform?.proxies).toContain('香港 01')
    expect(platform?.proxies).toContain('节点选择')
  })

  it('keeps the download group direct unless downloadViaProxy is enabled', () => {
    const result = compile()
    const groups = result.profile['proxy-groups'] as unknown as GroupLike[]
    const downloadGroup = groups.find((group) => group.name === '⬇️ 游戏下载')
    expect(downloadGroup?.proxies).toEqual(['DIRECT'])
    expect(downloadGroup?.['default-selected']).toBe('DIRECT')

    const config = createConfig()
    config.downloadViaProxy = true
    const enabled = compile(baseProfile, config)
    const enabledGroups = enabled.profile['proxy-groups'] as unknown as GroupLike[]
    expect(enabledGroups.find((group) => group.name === '⬇️ 游戏下载')?.proxies).toEqual([
      'DIRECT',
      '🌐 游戏平台'
    ])
  })

  it('uses exclusive mode with a final MATCH,DIRECT', () => {
    const config = createConfig()
    config.mode = 'exclusive'
    const result = compile(baseProfile, config)
    const rules = result.profile.rules as unknown as string[]
    expect(rules.at(-1)).toBe('MATCH,DIRECT')
    expect(ruleIndex(rules, 'MATCH,节点选择')).toBe(-1)
  })

  it('applies anti-cheat policy and DNS/TUN patches', () => {
    const result = compile()
    const rules = result.profile.rules as unknown as string[]
    expect(rules).toContain('PROCESS-NAME,EasyAntiCheat.exe,🎮 游戏加速')
    expect(rules).toContain('PROCESS-NAME,vgc.exe,DIRECT')

    expect(result.profile.tun['endpoint-independent-nat']).toBe(true)
    expect(result.profile.tun['udp-timeout']).toBe(300)
    expect(result.profile.sniffer.enable).toBe(true)
    expect(result.profile.dns['nameserver-policy']).toMatchObject({
      '+.steamcontent.com': '223.5.5.5'
    })
    expect(result.summary.tunPatches).toContain('download-dns')
  })

  it('does not patch TUN when TUN is disabled', () => {
    const profile = {
      ...baseProfile,
      tun: { enable: false, stack: 'mixed' }
    } as unknown as MihomoConfig
    const result = compile(profile)
    expect(result.profile.tun['endpoint-independent-nat']).toBeUndefined()
    expect(result.profile.tun['udp-timeout']).toBeUndefined()
  })

  it('reports invalid game rules instead of throwing', () => {
    const config = createConfig()
    config.games[0].match.processPaths = ['C:\\bad,path.exe']
    config.games[0].match.domains = ['bad domain']
    const result = compile(baseProfile, config)
    expect(result.diagnostics.some((item) => item.code === 'GAME_PATH_INVALID')).toBe(true)
    expect(result.diagnostics.some((item) => item.code === 'GAME_DOMAIN_INVALID')).toBe(true)
  })

  it('keeps mixed-domain direct fallbacks reachable', () => {
    const config = createConfig()
    config.platforms = Object.fromEntries(
      ['gog', 'ubisoft', 'ea', 'battlenet', 'xbox'].map((id) => [
        id,
        {
          enable: true,
          extraDownload: [],
          extraDownloadKeyword: [],
          extraPlatform: [],
          removed: []
        }
      ])
    )
    const result = compile(baseProfile, config)
    const rules = result.profile.rules as unknown as string[]

    const pairs: [string, string][] = [
      ['www.gog.com', 'gog.com'],
      ['www.ubisoft.com', 'ubisoft.com'],
      ['www.ea.com', 'ea.com'],
      ['www.blizzard.com', 'blizzard.com'],
      ['xbox.com', 'xboxlive.com']
    ]
    for (const [platformDomain, mixedDomain] of pairs) {
      expect(ruleIndex(rules, `DOMAIN,${platformDomain},🌐 游戏平台`)).toBeGreaterThan(-1)
      expect(ruleIndex(rules, `DOMAIN-SUFFIX,${mixedDomain},DIRECT`)).toBeGreaterThan(-1)
      expect(ruleIndex(rules, `DOMAIN,${platformDomain},🌐 游戏平台`)).toBeLessThan(
        ruleIndex(rules, `DOMAIN-SUFFIX,${mixedDomain},DIRECT`)
      )
    }
    expect(rules).not.toContain('DOMAIN-SUFFIX,gog.com,🌐 游戏平台')
    expect(rules).not.toContain('DOMAIN-SUFFIX,ea.com,🌐 游戏平台')
    expect(result.diagnostics.some((item) => item.code === 'GEOSITE_MISSING')).toBe(false)
  })

  it('reports actual generated group names after conflict renaming', () => {
    const profile = {
      ...baseProfile,
      'proxy-groups': [
        { name: '🎮 游戏加速', type: 'select', proxies: ['香港 01'] },
        { name: '节点选择', type: 'select', proxies: ['香港 01', '日本 01'] }
      ]
    } as unknown as MihomoConfig
    const result = compile(profile)
    const groups = result.profile['proxy-groups'] as unknown as GroupLike[]
    expect(result.summary.groupNames.game).toBe('🎮 游戏加速 2')
    expect(groups.some((group) => group.name === '🎮 游戏加速 2')).toBe(true)
  })

  it('skips regions with invalid filters instead of writing an invalid regex', () => {
    const config = createConfig()
    config.regions = [{ name: '坏', filter: '[', enable: true }]
    const result = compile(baseProfile, config)
    const groups = result.profile['proxy-groups'] as unknown as GroupLike[]
    expect(result.diagnostics.some((item) => item.code === 'REGION_FILTER_INVALID')).toBe(true)
    expect(groups.some((group) => group.name === '🎮 区域·坏')).toBe(false)
  })
})
