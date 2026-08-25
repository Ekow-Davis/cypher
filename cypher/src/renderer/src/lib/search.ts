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


export interface DocOccurrence {
  /** Position in the chapter's hit list — the Nth match in document order. */
  index: number
  /** Excerpt with the match wrapped in <mark>. */
  snippet: string
  /** Roughly how far through the chapter this sits, 0–1, for a position hint. */
  progress: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Every occurrence of `query` in a chapter, in document order.
 *
 * Deliberately mirrors findMatches() in findReplace.ts: it searches inside each
 * text node rather than across the whole flattened string, so a phrase broken
 * by a bold run is not counted here either. That parity is what lets the
 * sidebar say "hit 3" and the editor jump to the same hit 3 — if the two
 * counted differently, every click would land on the wrong word.
 */
export function findOccurrences(contentJson: string, query: string): DocOccurrence[] {
  const q = query.trim().toLowerCase()
  if (!q || !contentJson) return []

  let doc: any
  try {
    doc = JSON.parse(contentJson)
  } catch {
    return []
  }

  // Collect text nodes with their offset into the flattened text, so a snippet
  // can show context that crosses node boundaries even though matches cannot.
  const nodes: { text: string; offset: number }[] = []
  let flat = ''
  const walk = (node: any): void => {
    if (typeof node?.text === 'string') {
      nodes.push({ text: node.text, offset: flat.length })
      flat += node.text
      return
    }
    if (Array.isArray(node?.content)) {
      node.content.forEach(walk)
      // Block boundaries read as a space in the flattened text.
      if (node.type && node.type !== 'text') flat += ' '
    }
  }
  walk(doc)

  const occurrences: DocOccurrence[] = []
  for (const node of nodes) {
    const hay = node.text.toLowerCase()
    let at = hay.indexOf(q)
    while (at !== -1) {
      const globalAt = node.offset + at
      occurrences.push({
        index: occurrences.length,
        snippet: snippetAround(flat, globalAt, query.trim().length),
        progress: flat.length ? globalAt / flat.length : 0
      })
      at = hay.indexOf(q, at + q.length)
    }
  }
  return occurrences
}

/** Excerpt around a known offset, so each hit shows its own context. */
function snippetAround(text: string, at: number, length: number, radius = 55): string {
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + length + radius)
  const pre = (start > 0 ? '…' : '') + escapeHtml(text.slice(start, at).replace(/\s+/g, ' '))
  const hit = escapeHtml(text.slice(at, at + length))
  const post =
    escapeHtml(text.slice(at + length, end).replace(/\s+/g, ' ')) + (end < text.length ? '…' : '')
  return `${pre}<mark class="cypher-mark">${hit}</mark>${post}`
}
