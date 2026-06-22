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
