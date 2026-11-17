import { Color } from 'three'

export interface FilamentSwatch {
  id: string
  name: string
  hex: string
}

export const DEFAULT_FILAMENT_COLOR = '#8899AA'

export const FILAMENT_PRESETS: readonly FilamentSwatch[] = [
  { id: 'prusa-orange', name: 'Prusa Orange', hex: '#FF6A00' },
  { id: 'bambu-green', name: 'Bambu Green', hex: '#00AE42' },
  { id: 'galaxy-blue', name: 'Galaxy Blue', hex: '#2563EB' },
  { id: 'signal-red', name: 'Signal Red', hex: '#DC2626' },
  { id: 'sun-yellow', name: 'Sun Yellow', hex: '#F59E0B' },
  { id: 'lavender-purple', name: 'Lavender Purple', hex: '#7C3AED' },
  { id: 'cyan-teal', name: 'Cyan Teal', hex: '#06B6D4' },
  { id: 'silk-gold', name: 'Silk Gold', hex: '#D97706' },
  { id: 'slate-gray', name: 'Slate Gray', hex: '#8899AA' },
  { id: 'galaxy-black', name: 'Galaxy Black', hex: '#1E293B' },
  { id: 'cold-white', name: 'Cold White', hex: '#F8FAFC' },
] as const

/**
 * Deterministically maps any string identifier to one of the filament preset colors.
 */
export function hashStringToFilamentColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % FILAMENT_PRESETS.length
  return FILAMENT_PRESETS[index].hex
}

/**
 * Offsets the base color for multi-part 3MF assemblies, ensuring each part has
 * a distinct, visually pleasing filament color while remaining deterministic.
 */
export function getAssemblyPaletteColor(baseHex: string | number, partIndex: number): string {
  if (partIndex <= 0) {
    if (typeof baseHex === 'number') {
      return `#${baseHex.toString(16).padStart(6, '0').toUpperCase()}`
    }
    return baseHex
  }

  const normalized = typeof baseHex === 'number'
    ? `#${baseHex.toString(16).padStart(6, '0').toUpperCase()}`
    : (baseHex.startsWith('#') ? baseHex.toUpperCase() : `#${baseHex.toUpperCase()}`)

  const presetIndex = FILAMENT_PRESETS.findIndex((preset) => preset.hex.toUpperCase() === normalized)
  if (presetIndex !== -1) {
    return FILAMENT_PRESETS[(presetIndex + partIndex) % FILAMENT_PRESETS.length].hex
  }

  try {
    const color = new Color(baseHex)
    const hsl = { h: 0, s: 0, l: 0 }
    color.getHSL(hsl)
    const goldenRatio = 0.618033988749895
    const shiftedHue = (hsl.h + partIndex * goldenRatio) % 1.0
    const s = Math.max(0.4, Math.min(0.85, hsl.s || 0.65))
    const l = Math.max(0.35, Math.min(0.65, hsl.l || 0.5))
    color.setHSL(shiftedHue, s, l)
    return `#${color.getHexString().toUpperCase()}`
  } catch {
    return FILAMENT_PRESETS[partIndex % FILAMENT_PRESETS.length].hex
  }
}
