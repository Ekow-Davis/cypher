/**
 * The Cypher mark, as an inline SVG.
 *
 * Inlined as a data URI rather than served as a file so it works in three
 * places at once: the hosted site, the hosted reader, and the standalone HTML
 * a shared book is exported to — that last one may be opened from a USB stick
 * with no server to fetch an icon from.
 */

const ACCENT = '#a78bfa'

/** A rounded C whose top-right corner folds like paper. */
export const BRAND_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<path d="M42 14H24a10 10 0 0 0-10 10v16a10 10 0 0 0 10 10h14a10 10 0 0 0 10-10" ` +
  `fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round"/>` +
  `<path d="M42 14l13 13H42z" fill="${ACCENT}"/>` +
  `</svg>`

/** Encoded for a <link rel="icon"> href. */
export function faviconDataUri(): string {
  return `data:image/svg+xml,${encodeURIComponent(BRAND_SVG)}`
}

/** The same mark for use inline in a page, at a given pixel size. */
export function brandSvg(size: number): string {
  return BRAND_SVG.replace('<svg ', `<svg width="${size}" height="${size}" aria-hidden="true" `)
}
