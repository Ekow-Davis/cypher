/**
 * Turns typed `@Handles` into real reference marks.
 *
 * Imported notes (and pasted text) arrive with references written by hand —
 * `@TheCrimsonChapel`, `@The_Crimson_Chapel`, `@the-crimson-chapel` — rather
 * than as mention nodes. Each handle is compared with the codex and the cast
 * ignoring case, spaces, underscores and hyphens; a match becomes the same
 * clickable mention the @ menu inserts, anything else is left as typed.
 */
export type MentionKind = 'character' | 'lore'

/** Case- and separator-insensitive form, so "Crimson_Chapel" finds "Crimson Chapel". */
export function looseKey(value: string): string {
  return value.toLowerCase().replace(/[\s_\-]+/g, '')
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RefTarget {
  id: number
  label: string
  kind: MentionKind
}

export interface ResolveReport {
  /** Distinct handles that became references, as written. */
  resolved: string[]
  /** Distinct handles with no matching entry or character. */
  unresolved: string[]
  /** Total mention nodes created. */
  count: number
}

/**
 * Lore is indexed first, so a place and a person that normalise to the same
 * key resolve to the lore entry — the import is lore-facing, and a character
 * can still be picked by hand from the @ menu.
 */
export function buildRefIndex(
  lore: { id: number; title: string }[],
  characters: { id: number; name: string }[]
): Map<string, RefTarget> {
  const index = new Map<string, RefTarget>()
  for (const e of lore) {
    const key = looseKey(e.title)
    if (key && !index.has(key)) index.set(key, { id: e.id, label: e.title, kind: 'lore' })
  }
  for (const c of characters) {
    const key = looseKey(c.name)
    if (key && !index.has(key)) index.set(key, { id: c.id, label: c.name, kind: 'character' })
  }
  return index
}

const HANDLE = /@([\p{L}\p{N}_'’-]+)/gu

/**
 * Finds the entry a handle names, and how much of the handle it consumed.
 * Trailing possessives and punctuation are tried off in turn, so
 * `@TheCrimsonChapel's` links the chapel and leaves "'s" as ordinary text.
 */
function lookup(
  token: string,
  index: Map<string, RefTarget>
): { target: RefTarget; used: number } | null {
  const candidates: string[] = [token]
  const possessive = token.match(/^(.*?)['’]s$/)
  if (possessive) candidates.push(possessive[1])
  const trimmed = token.replace(/[-_'’]+$/, '')
  if (trimmed !== token) candidates.push(trimmed)
  for (const c of candidates) {
    const target = index.get(looseKey(c))
    if (target) return { target, used: c.length }
  }
  return null
}

function mentionNode(target: RefTarget): any {
  return {
    type: 'mention',
    attrs: { id: target.id, label: target.label, kind: target.kind, mentionSuggestionChar: '@' }
  }
}

/** Rewrites a Tiptap JSON document in place-safe fashion and reports what it did. */
export function resolveHandles(doc: any, index: Map<string, RefTarget>): { doc: any; report: ResolveReport } {
  const resolved = new Set<string>()
  const unresolved = new Set<string>()
  let count = 0

  const splitText = (node: any): any[] => {
    const text: string = node.text ?? ''
    if (!text.includes('@')) return [node]
    // Code keeps its text literally — an @ in a snippet is not a reference.
    if (node.marks?.some((m: any) => m.type === 'code')) return [node]

    const out: any[] = []
    let last = 0
    const pushText = (value: string): void => {
      if (value) out.push({ ...node, text: value })
    }
    for (const match of text.matchAll(HANDLE)) {
      const at = match.index ?? 0
      // An @ inside a word (an email address) is not a handle.
      if (at > 0 && /[\p{L}\p{N}]/u.test(text[at - 1])) continue
      const token = match[1]
      const hit = lookup(token, index)
      if (!hit) {
        unresolved.add(`@${token}`)
        continue
      }
      pushText(text.slice(last, at))
      out.push(mentionNode(hit.target))
      resolved.add(`@${token.slice(0, hit.used)}`)
      count++
      last = at + 1 + hit.used
    }
    pushText(text.slice(last))
    return out
  }

  const walk = (node: any): any => {
    if (!Array.isArray(node?.content)) return node
    const content: any[] = []
    for (const child of node.content) {
      if (child?.type === 'text') content.push(...splitText(child))
      else content.push(walk(child))
    }
    return { ...node, content }
  }

  return {
    doc: walk(doc),
    report: { resolved: [...resolved], unresolved: [...unresolved], count }
  }
}
