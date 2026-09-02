import type { Mode } from '@/stores/theme'

/**
 * Surface palettes — the page and panel colours, independent of the accent.
 *
 * A palette supplies only a base colour per mode; every other surface is
 * derived from it. That keeps a theme to two decisions instead of twelve, and
 * means a custom colour produces a complete, readable set rather than needing
 * the user to pick borders and dim text by hand.
 */

export type PaletteName = 'default' | 'graphite' | 'black' | 'blue' | 'pink' | 'custom'

export interface Palette {
  name: Exclude<PaletteName, 'custom'>
  label: string
  /** Base background per mode; everything else is derived from these. */
  dark: string
  light: string
}

export const PALETTES: Palette[] = [
  { name: 'default', label: 'Default', dark: '#15121d', light: '#f6f5fb' },
  { name: 'graphite', label: 'Graphite', dark: '#1a1a1c', light: '#f4f4f5' },
  { name: 'black', label: 'Black', dark: '#000000', light: '#ffffff' },
  { name: 'blue', label: 'Blue', dark: '#0f172a', light: '#f0f5fc' },
  { name: 'pink', label: 'Pink', dark: '#1f1218', light: '#fdf2f6' }
]

export function paletteByName(name: PaletteName): Palette {
  return PALETTES.find((p) => p.name === name) ?? PALETTES[0]
}

/** The base colour a palette uses in the given mode. */
export function baseFor(name: PaletteName, mode: Mode, customDark: string, customLight: string): string {
  if (name === 'custom') return mode === 'dark' ? customDark : customLight
  const palette = paletteByName(name)
  return mode === 'dark' ? palette.dark : palette.light
}
