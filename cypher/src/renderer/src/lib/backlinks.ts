/**
 * Who mentions whom: scans chapters and lore entries for @ references.
 *
 * Built on demand from the documents already in the stores, so it can never
 * drift out of date the way a separately stored index could. Parsing is cached
 * per document and only redone when that document's content changes.
 */
import type { MentionKind } from './mentionRefs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MentionHit {
  kind: MentionKind
  id: number
  /** The paragraph around the mention, with the mention marked by ⟦ ⟧. */
  snippet: string
}

const cache = new Map<string, { content: string; hits: MentionHit[] }>()

function blockText(node: any, target?: any): string {
  let out = ''
  const walk = (n: any): void => {
    if (n.type === 'text') out += n.text ?? ''
    else if (n.type === 'mention') {
      const label = String(n.attrs?.label ?? '')
      out += n === target ? `⟦${label}⟧` : label
    } else if (n.type === 'hardBreak') out += ' '
    n.content?.forEach(walk)
  }
  walk(node)
  return out
}

/** Trims a paragraph to a window around the marked mention. */
function around(text: string, radius = 70): string {
  const at = text.indexOf('⟦')
  if (at === -1) return text.slice(0, radius * 2)
  const end = text.indexOf('⟧', at)
  const start = Math.max(0, at - radius)
  const stop = Math.min(text.length, end + 1 + radius)
  return (start > 0 ? '…' : '') + text.slice(start, stop).trim() + (stop < text.length ? '…' : '')
}

/** Every mention in a stored document, with context. Cached by `key`. */
export function mentionsIn(key: string, content: string): MentionHit[] {
  const cached = cache.get(key)
  if (cached && cached.content === content) return cached.hits
  const hits: MentionHit[] = []
  if (content && content.includes('"mention"')) {
    try {
      const doc = JSON.parse(content)
      const visitBlock = (block: any): void => {
        // Find mentions inside this textblock; recurse into containers.
        const inner: any[] = []
        const collect = (n: any): void => {
          if (n.type === 'mention') inner.push(n)
          n.content?.forEach(collect)
        }
        if (block.content?.some((c: any) => c.type === 'text' || c.type === 'mention')) {
          collect(block)
          for (const m of inner) {
            const id = Number(m.attrs?.id)
            if (!Number.isFinite(id)) continue
            hits.push({
              kind: m.attrs?.kind === 'lore' ? 'lore' : 'character',
              id,
              snippet: around(blockText(block, m))
            })
          }
        } else {
          block.content?.forEach(visitBlock)
        }
      }
      doc.content?.forEach(visitBlock)
    } catch {
      /* unreadable content has no links */
    }
  }
  cache.set(key, { content, hits })
  return hits
}

export interface Backlink {
  source: 'chapter' | 'lore'
  id: number
  title: string
  count: number
  snippets: string[]
}

/** Documents that reference `kind`/`id`, most references first. */
export function backlinksTo(
  kind: MentionKind,
  id: number,
  chapters: { id: number; title: string; content: string }[],
  lore: { id: number; title: string; content: string }[]
): Backlink[] {
  const out: Backlink[] = []
  const scan = (source: 'chapter' | 'lore', docs: { id: number; title: string; content: string }[]): void => {
    for (const d of docs) {
      if (source === 'lore' && kind === 'lore' && d.id === id) continue
      const hits = mentionsIn(`${source}:${d.id}`, d.content).filter(
        (h) => h.kind === kind && h.id === id
      )
      if (hits.length) {
        out.push({ source, id: d.id, title: d.title, count: hits.length, snippets: hits.map((h) => h.snippet) })
      }
    }
  }
  scan('chapter', chapters)
  scan('lore', lore)
  return out
}
