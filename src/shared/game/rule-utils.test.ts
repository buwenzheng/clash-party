import { describe, expect, it } from 'vitest'
import {
  directoryToProcessPathRegex,
  formatRule,
  isValidCidr,
  isValidDomain,
  isValidGroupName,
  isValidProcessName,
  isValidProcessPath,
  joinRuleList,
  normalizeCidr,
  normalizeDomain,
  uniqueRules
} from './rule-utils'

describe('directoryToProcessPathRegex', () => {
  it('escapes Windows paths and appends a separator', () => {
    expect(
      directoryToProcessPathRegex('D:\\SteamLibrary\\steamapps\\common\\Apex Legends', 'win32')
    ).toBe('(?i)^D:\\\\SteamLibrary\\\\steamapps\\\\common\\\\Apex Legends\\\\')
  })

  it('removes a trailing separator before appending one', () => {
    expect(directoryToProcessPathRegex('C:\\Games\\Apex\\', 'win32')).toBe(
      '(?i)^C:\\\\Games\\\\Apex\\\\'
    )
  })

  it('escapes parentheses and encodes commas', () => {
    expect(directoryToProcessPathRegex('C:\\Program Files (x86)\\Game,One', 'win32')).toBe(
      '(?i)^C:\\\\Program Files \\(x86\\)\\\\Game\\x2COne\\\\'
    )
  })

  it('keeps Chinese characters and handles UNC paths', () => {
    expect(directoryToProcessPathRegex('D:\\游戏\\Apex', 'win32')).toBe(
      '(?i)^D:\\\\游戏\\\\Apex\\\\'
    )
    expect(directoryToProcessPathRegex('\\\\server\\share\\game', 'win32')).toBe(
      '(?i)^\\\\\\\\server\\\\share\\\\game\\\\'
    )
  })

  it('omits the case-insensitive flag on Linux', () => {
    expect(directoryToProcessPathRegex('/home/user/game', 'linux')).toBe('^/home/user/game/')
    expect(directoryToProcessPathRegex('/Users/me/game', 'darwin')).toBe('(?i)^/Users/me/game/')
  })
})

describe('domain and CIDR validation', () => {
  it('accepts and normalizes valid domains', () => {
    expect(isValidDomain('store.steampowered.com')).toBe(true)
    expect(normalizeDomain(' Store.SteamPowered.COM. ')).toBe('store.steampowered.com')
    expect(normalizeDomain('localhost')).toBe('localhost')
  })

  it('rejects invalid domains', () => {
    expect(isValidDomain('')).toBe(false)
    expect(isValidDomain('a..b')).toBe(false)
    expect(isValidDomain('a,b')).toBe(false)
    expect(isValidDomain('-a.com')).toBe(false)
    expect(isValidDomain('a b.com')).toBe(false)
  })

  it('validates IPv4 and IPv6 CIDRs', () => {
    expect(isValidCidr('192.168.1.0/24')).toBe(true)
    expect(isValidCidr('10.0.0.0/8')).toBe(true)
    expect(isValidCidr('2001:db8::/32')).toBe(true)
    expect(isValidCidr('192.168.1.0/33')).toBe(false)
    expect(isValidCidr('999.1.1.1/24')).toBe(false)
    expect(isValidCidr('not-a-cidr')).toBe(false)
    expect(normalizeCidr(' 192.168.1.0/24 ')).toBe('192.168.1.0/24')
  })
})

describe('process and group validation', () => {
  it('rejects commas and newlines', () => {
    expect(isValidProcessName('game.exe')).toBe(true)
    expect(isValidProcessName('game,exe')).toBe(false)
    expect(isValidProcessName('game\n.exe')).toBe(false)
    expect(isValidProcessPath('C:\\Games\\a.exe')).toBe(true)
    expect(isValidProcessPath('C:\\Games\\a,b.exe')).toBe(false)
    expect(isValidGroupName('🎮 游戏加速')).toBe(true)
    expect(isValidGroupName('a,b')).toBe(false)
  })
})

describe('rule helpers', () => {
  it('formats rules and joins unique entries', () => {
    expect(formatRule('DOMAIN-SUFFIX', 'steampowered.com', '🌐 游戏平台')).toBe(
      'DOMAIN-SUFFIX,steampowered.com,🌐 游戏平台'
    )
    expect(formatRule('IP-CIDR', '10.0.0.0/8', 'DIRECT', 'no-resolve')).toBe(
      'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve'
    )
    expect(joinRuleList(['a', 'b'])).toBe('a\nb')
    expect(uniqueRules(['a', 'b', 'a'])).toEqual(['a', 'b'])
  })
})
