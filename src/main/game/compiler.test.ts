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
})
