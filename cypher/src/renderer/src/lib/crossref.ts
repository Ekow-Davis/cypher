import { Node, mergeAttributes } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RefKind = 'heading' | 'figure' | 'table' | 'footnote'

let seq = 0
function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`
}

/**
 * StarterKit's Heading has no id. A cross-reference needs one to survive
 * edits, so this gives every heading a stable id assigned once, the moment it
 * becomes a heading — the same treatment captions get.
 */
export const IdentifiedHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      refId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-ref-id'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.refId ? { 'data-ref-id': String(attrs.refId) } : {}
      }
    }
  }
})

export interface Referenceable {
  /** A stable id the reference points at — survives edits, unlike a position. */
  id: string
  kind: RefKind
  /** Display number, e.g. "2.1" for a heading, "3" for a figure. */
  number: string
  label: string
}

/**
 * A cross-reference field: "see Figure 3", "Section 2.1".
 *
 * Stores the target's id, never its number — the number is resolved fresh
 * every time the document is scanned, so re-ordering headings or captions
 * updates every reference to them instead of leaving stale numbers behind.
 */
export const CrossReference = Node.create({
  name: 'crossref',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetId: { default: null },
      kind: { default: 'heading' as RefKind },
      display: { default: '' } // last-resolved text, shown until re-resolved
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-crossref]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-crossref': 'true', class: 'crossref' }),
      String(node.attrs.display ?? '?')
    ]
  },

  addCommands() {
    return {
      insertCrossReference:
        (targetId: string, kind: RefKind, display: string) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({ type: 'crossref', attrs: { targetId, kind, display } })
    } as never
  }
})

/**
 * A caption attached to whatever precedes it (an image, a table). Numbered by
 * kind and document order — "Figure 1", "Figure 2", "Table 1" — the same
 * scheme the References panel resolves headings with.
 */
export const Caption = Node.create({
  name: 'caption',
  group: 'block',
  content: 'inline*',

  addAttributes() {
    return {
      captionId: { default: null },
      kind: { default: 'figure' as 'figure' | 'table' }
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-caption]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { 'data-caption': 'true', class: 'caption-block' }), 0]
  },

  addCommands() {
    return {
      insertCaption:
        (kind: 'figure' | 'table', captionId: string) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: 'caption',
            attrs: { captionId, kind },
            content: [{ type: 'text', text: 'Caption text' }]
          })
    } as never
  }
})

/**
 * Every referenceable item in the document, numbered by kind and order.
 * Headings get dotted section numbers (1, 1.1, 1.1.1); figures, tables, and
 * footnotes get flat counters within their own kind.
 */
export function collectReferenceables(doc: any): Referenceable[] {
  const out: Referenceable[] = []
  const counters = [0, 0, 0, 0, 0, 0]
  const kindCounts: Record<string, number> = { figure: 0, table: 0, footnote: 0 }
  let uid = 0

  doc.descendants((node: any) => {
    if (node.type.name === 'heading') {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level ?? 1)))
      counters[level - 1] += 1
      for (let i = level; i < counters.length; i++) counters[i] = 0
      const number = counters.slice(0, level).join('.')
      const text = node.textContent.trim()
      if (text && node.attrs.refId) {
        out.push({ id: node.attrs.refId, kind: 'heading', number, label: text })
      }
      return
    }
    if (node.type.name === 'caption') {
      kindCounts[node.attrs.kind] += 1
      const number = String(kindCounts[node.attrs.kind])
      const text = node.textContent.trim() || `${node.attrs.kind} ${number}`
      out.push({
        id: node.attrs.captionId,
        kind: node.attrs.kind,
        number,
        label: text
      })
      return
    }
    if (node.type.name === 'footnote') {
      kindCounts.footnote += 1
      out.push({
        id: node.attrs.refId ?? `fn-${uid++}`,
        kind: 'footnote',
        number: String(kindCounts.footnote),
        label: 'Footnote'
      })
    }
  })
  return out
}

export { newId }

export function displayFor(ref: Referenceable): string {
  switch (ref.kind) {
    case 'heading':
      return `Section ${ref.number}`
    case 'figure':
      return `Figure ${ref.number}`
    case 'table':
      return `Table ${ref.number}`
    case 'footnote':
      return `Note ${ref.number}`
    default:
      return ref.number
  }
}
