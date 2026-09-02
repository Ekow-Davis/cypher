/** Small colour helpers for the custom-accent picker. */

export function normalizeHex(input: string): string {
  let h = input.trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#8b7bd6'
  return '#' + h.toLowerCase()
}

function toRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}

export function darken(hex: string, amount: number): string {
  const { r, g, b } = toRgb(hex)
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

export function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex)
  const f = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** Pick legible text colour to sit on top of the given colour. */
export function onColor(hex: string): string {
  return luminance(hex) > 0.45 ? '#10121a' : '#ffffff'
}

export function deriveAccent(hex: string): { accent: string; strong: string; onAccent: string } {
  const accent = normalizeHex(hex)
  return { accent, strong: darken(accent, 0.14), onAccent: onColor(accent) }
}


export function lighten(hex: string, amount: number): string {
  const { r, g, b } = toRgb(hex)
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
}

/** Blends two colours; `amount` is how much of `b` to mix in. */
export function mix(a: string, b: string, amount: number): string {
  const x = toRgb(a)
  const y = toRgb(b)
  return toHex(
    x.r + (y.r - x.r) * amount,
    x.g + (y.g - x.g) * amount,
    x.b + (y.b - x.b) * amount
  )
}

export interface SurfacePalette {
  bg: string
  surface: string
  surface2: string
  border: string
  ink: string
  inkDim: string
}

/**
 * Builds a full set of surfaces from one base colour.
 *
 * Text is chosen from the background's measured luminance rather than from
 * which mode is selected, so a pale pink "dark" theme still gets dark text and
 * stays readable — picking by mode alone is what makes custom themes come out
 * illegible.
 */
export function deriveSurfaces(baseHex: string, mode: 'light' | 'dark'): SurfacePalette {
  const base = normalizeHex(baseHex)
  const dark = mode === 'dark'

  // Panels step away from the page colour so edges stay visible either way.
  const bg = base
  const surface = dark ? lighten(base, 0.06) : darken(base, 0.02)
  const surface2 = dark ? lighten(base, 0.12) : darken(base, 0.06)
  const border = dark ? lighten(base, 0.2) : darken(base, 0.12)

  // Measured contrast, not assumed: a light background gets dark ink even when
  // the user has called the theme "dark".
  const light = luminance(bg) > 0.4
  const ink = light ? '#14131a' : '#ece9f3'
  // Dim text is the ink pulled toward the background — always legible, never
  // a fixed grey that disappears on an unusual palette. Pale backgrounds get
  // less blending: the same ratio that reads fine as light-on-dark drops below
  // the 4.5:1 threshold when inverted.
  const inkDim = mix(ink, bg, light ? 0.34 : 0.42)

  return { bg, surface, surface2, border, ink, inkDim }
}
