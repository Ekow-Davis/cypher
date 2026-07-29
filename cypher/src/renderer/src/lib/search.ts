/** Shared search helpers: matching, counting, and highlighted snippets. */

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

export function matches(text: string, query: string): boolean {
  if (!query.trim()) return false
  return text.toLowerCase().includes(query.toLowerCase())
}

export function countMatches(text: string, query: string): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const hay = text.toLowerCase()
  let count = 0
  let i = hay.indexOf(q)
  while (i !== -1) {
    count++
    i = hay.indexOf(q, i + q.length)
  }
  return count
}

/**
 * A short excerpt around the first match, HTML-escaped, with the match wrapped
 * in <mark>. Escaping happens per-segment so the highlight tag survives while
 * user text can never inject markup.
 */
export function snippetHtml(text: string, query: string, radius = 70): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const q = query.trim()
  if (!q) return escapeHtml(clean.slice(0, radius * 2))
  const idx = clean.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return escapeHtml(clean.slice(0, radius * 2))

  const start = Math.max(0, idx - radius)
  const end = Math.min(clean.length, idx + q.length + radius)
  const pre = (start > 0 ? '…' : '') + escapeHtml(clean.slice(start, idx))
  const hit = escapeHtml(clean.slice(idx, idx + q.length))
  const post = escapeHtml(clean.slice(idx + q.length, end)) + (end < clean.length ? '…' : '')
  return `${pre}<mark class="cypher-mark">${hit}</mark>${post}`
}
