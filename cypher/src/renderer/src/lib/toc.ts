import { Node, mergeAttributes } from '@tiptap/core'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TocEntry {
  text: string
  level: number
  page: number
}

/**
 * A table of contents field.
 *
 * Held as an atom node carrying its entries, rather than editable text: a TOC
 * is generated, and letting it be typed into would mean regenerating silently
 * discards edits. It refreshes on demand — the same bargain Word makes.
 */
export const TableOfContents = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      title: { default: 'Contents' },
      entries: {
        default: [] as TocEntry[],
        parseHTML: (el: HTMLElement) => {
          try {
            return JSON.parse(el.getAttribute('data-entries') ?? '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-entries': JSON.stringify(attrs.entries ?? [])
        })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-toc]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const entries = (node.attrs.entries ?? []) as TocEntry[]
    const rows = entries.map((e) => [
      'div',
      { class: `toc-row toc-level-${e.level}` },
      ['span', { class: 'toc-text' }, e.text],
      ['span', { class: 'toc-dots' }],
      ['span', { class: 'toc-page' }, String(e.page)]
    ])
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-toc': 'true', class: 'toc-block' }),
      ['div', { class: 'toc-title' }, node.attrs.title ?? 'Contents'],
      ...rows
    ]
  },

  addCommands() {
    return {
      insertTableOfContents:
        (entries: TocEntry[]) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({ type: 'toc', attrs: { entries } }),
      refreshTableOfContents:
        (entries: TocEntry[]) =>
        ({ state, dispatch }: { state: any; dispatch: any }) => {
          let found = -1
          state.doc.descendants((node: any, pos: number) => {
            if (node.type.name === 'toc' && found === -1) found = pos
          })
          if (found === -1) return false
          if (dispatch) {
            dispatch(state.tr.setNodeMarkup(found, undefined, { ...state.doc.nodeAt(found).attrs, entries }))
          }
          return true
        }
    } as never
  }
})
