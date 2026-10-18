import { describe, expect, it } from 'vitest'
import { compareVersions } from './version'

describe('compareVersions', () => {
  it('compares major, minor and patch', () => {
    expect(compareVersions('2.1.0', '2.0.9')).toBe(1)
    expect(compareVersions('2.1.1', '2.1.0')).toBe(1)
    expect(compareVersions('2.1.0', '2.1.0')).toBe(0)
    expect(compareVersions('1.9.9', '2.0.0')).toBe(-1)
  })

  it('accepts v prefix and missing patch', () => {
    expect(compareVersions('v2.1.0', '2.1.0')).toBe(0)
    expect(compareVersions('2.1', '2.1.0')).toBe(0)
  })

  it('treats a release as newer than its prerelease', () => {
    expect(compareVersions('2.1.0', '2.1.0-rc.1')).toBe(1)
    expect(compareVersions('2.1.0-rc.1', '2.1.0')).toBe(-1)
  })

  it('compares prerelease identifiers numerically and lexically', () => {
    expect(compareVersions('2.1.0-beta.2', '2.1.0-beta.1')).toBe(1)
    expect(compareVersions('2.1.0-beta.10', '2.1.0-beta.2')).toBe(1)
    expect(compareVersions('2.1.0-alpha.1', '2.1.0-alpha.beta')).toBe(-1)
    expect(compareVersions('2.1.0-rc.1', '2.1.0-beta.2')).toBe(1)
  })

  it('treats a shorter prerelease list as older', () => {
    expect(compareVersions('2.1.0-beta', '2.1.0-beta.1')).toBe(-1)
    expect(compareVersions('2.1.0-beta.1', '2.1.0-beta')).toBe(1)
  })

  it('compares dev builds', () => {
    expect(compareVersions('2.1.0-dev.1018.abc1234', '2.1.0-dev.1019.abc1234')).toBe(-1)
    expect(compareVersions('2.1.0-dev.1018.abc1234', '2.1.0')).toBe(-1)
  })

  it('ignores build metadata', () => {
    expect(compareVersions('2.1.0+build.1', '2.1.0')).toBe(0)
  })

  it('treats invalid versions as 0.0.0', () => {
    expect(compareVersions('404: Not Found', '2.1.0')).toBe(-1)
    expect(compareVersions('', '2.1.0')).toBe(-1)
    expect(compareVersions('not-a-version', 'not-a-version')).toBe(0)
  })
})
