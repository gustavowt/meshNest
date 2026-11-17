import { describe, expect, test } from 'vitest'
import {
  DEFAULT_FILAMENT_COLOR,
  FILAMENT_PRESETS,
  getAssemblyPaletteColor,
  hashStringToFilamentColor,
} from '@/services/rendering/filamentColors'

describe('filamentColors', () => {
  test('defines DEFAULT_FILAMENT_COLOR as #8899AA', () => {
    expect(DEFAULT_FILAMENT_COLOR).toBe('#8899AA')
  })

  test('provides realistic 3D-printing filament swatches', () => {
    expect(FILAMENT_PRESETS.length).toBe(11)

    const ids = FILAMENT_PRESETS.map((s) => s.id)
    expect(ids).toContain('prusa-orange')
    expect(ids).toContain('bambu-green')
    expect(ids).toContain('galaxy-blue')
    expect(ids).toContain('signal-red')
    expect(ids).toContain('sun-yellow')
    expect(ids).toContain('lavender-purple')
    expect(ids).toContain('cyan-teal')
    expect(ids).toContain('silk-gold')
    expect(ids).toContain('slate-gray')
    expect(ids).toContain('galaxy-black')
    expect(ids).toContain('cold-white')

    const orange = FILAMENT_PRESETS.find((s) => s.id === 'prusa-orange')
    expect(orange?.hex).toBe('#FF6A00')

    const green = FILAMENT_PRESETS.find((s) => s.id === 'bambu-green')
    expect(green?.hex).toBe('#00AE42')
  })

  test('hashStringToFilamentColor produces deterministic filament presets', () => {
    const color1 = hashStringToFilamentColor('model-123')
    const color2 = hashStringToFilamentColor('model-123')
    expect(color1).toBe(color2)

    const presetHexes = FILAMENT_PRESETS.map((p) => p.hex)
    expect(presetHexes).toContain(color1)

    // Different keys produce valid presets
    const colorA = hashStringToFilamentColor('part-A')
    const colorB = hashStringToFilamentColor('part-B')
    expect(presetHexes).toContain(colorA)
    expect(presetHexes).toContain(colorB)
  })

  test('getAssemblyPaletteColor returns base color for partIndex 0', () => {
    expect(getAssemblyPaletteColor('#FF6A00', 0)).toBe('#FF6A00')
    expect(getAssemblyPaletteColor(0x8899aa, 0)).toBe('#8899AA')
  })

  test('getAssemblyPaletteColor cycles preset colors when base matches a preset', () => {
    // Slate Gray is index 8 in FILAMENT_PRESETS
    // partIndex 1 -> index 9 (Galaxy Black #1E293B)
    // partIndex 2 -> index 10 (Cold White #F8FAFC)
    // partIndex 3 -> index 0 (Prusa Orange #FF6A00)
    expect(getAssemblyPaletteColor('#8899AA', 1)).toBe('#1E293B')
    expect(getAssemblyPaletteColor('#8899AA', 2)).toBe('#F8FAFC')
    expect(getAssemblyPaletteColor('#8899AA', 3)).toBe('#FF6A00')
  })

  test('getAssemblyPaletteColor offsets arbitrary custom colors deterministically', () => {
    const color0 = getAssemblyPaletteColor('#112233', 0)
    const color1 = getAssemblyPaletteColor('#112233', 1)
    const color2 = getAssemblyPaletteColor('#112233', 2)

    expect(color0).toBe('#112233')
    expect(color1.startsWith('#')).toBe(true)
    expect(color2.startsWith('#')).toBe(true)
    expect(color1).not.toBe(color0)
    expect(color2).not.toBe(color1)
  })
})
