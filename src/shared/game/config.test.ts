import { describe, expect, it } from 'vitest'
import { migrateGameAccelConfig } from './config'

describe('migrateGameAccelConfig', () => {
  it('fills defaults for missing fields', () => {
    const config = migrateGameAccelConfig({})
    expect(config.version).toBe(1)
    expect(config.enable).toBe(false)
    expect(config.mode).toBe('overlay')
    expect(config.downloadViaProxy).toBe(false)
    expect(config.tuning.downloadDns).toBe(true)
    expect(config.tuning.ensureSniffer).toBe(true)
    expect(config.tuning.gameFakeIpFilter).toBe(false)
    expect(config.guard.ignored).toEqual([])
  })

  it('migrates game defaults and inherits antiCheatPolicy', () => {
    const config = migrateGameAccelConfig({
      antiCheatPolicy: { eac: 'follow', vanguard: 'direct' },
      games: [
        {
          id: 'apex',
          name: 'Apex Legends',
          source: 'steam',
          match: { directories: ['D:\\Apex'] }
        }
      ]
    })
    expect(config.games[0].routeMode).toBe('process')
    expect(config.games[0].enable).toBe(true)
    expect(config.games[0].antiCheat).toEqual({ eac: 'follow', vanguard: 'direct' })
  })

  it('keeps a pending global restore marker even without the previous selection', () => {
    const config = migrateGameAccelConfig({
      pendingGlobalRestore: { mode: 'rule', gameId: 'apex' }
    })
    expect(config.pendingGlobalRestore).toEqual({ mode: 'rule', gameId: 'apex' })
  })

  it('keeps explicit values and drops invalid games', () => {
    const config = migrateGameAccelConfig({
      enable: true,
      mode: 'exclusive',
      tuning: { downloadDns: false, gameFakeIpFilter: true },
      guard: { enable: false, ignored: ['a.com'] },
      games: [{ id: 'ok' }, { name: 'missing id' }, null]
    })
    expect(config.enable).toBe(true)
    expect(config.mode).toBe('exclusive')
    expect(config.tuning.downloadDns).toBe(false)
    expect(config.tuning.gameFakeIpFilter).toBe(true)
    expect(config.guard.enable).toBe(false)
    expect(config.guard.ignored).toEqual(['a.com'])
    expect(config.games).toHaveLength(1)
    expect(config.games[0].id).toBe('ok')
  })
})
