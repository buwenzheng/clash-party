import { describe, expect, it } from 'vitest'
import { listBuiltinPresets } from './index'

describe('builtin game platform presets', () => {
  it('exposes unique platform ids for the supported launchers', () => {
    const presets = listBuiltinPresets()
    const ids = presets.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining(['steam', 'epic', 'gog', 'ubisoft', 'ea', 'battlenet', 'xbox'])
    )
  })
})
