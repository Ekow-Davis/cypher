import { Node, mergeAttributes } from '@tiptap/core'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A footnote reference.
 *
 * The note's text lives on the marker itself rather than in a separate block,
 * so moving or deleting the marker takes its note with it — there is no way to
 * end up with an orphaned note or a reference pointing at nothing.
 *
 * Numbering is derived from document order at render time, never stored, so
 * inserting a note in the middle renumbers everything after it automatically.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: { default: '' },
      // Lets a cross-reference point at this specific note and survive edits.
      refId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-ref-id'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.refId ? { 'data-ref-id': String(attrs.refId) } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        'data-footnote': 'true',
        class: 'footnote-ref',
        title: String(node.attrs.text ?? '')
      }),
      '•'
    ]
  },

  addCommands() {
    return {
      insertFootnote:
        (text: string) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: 'footnote',
            attrs: { text, refId: `fn-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }
          }),
      updateFootnote:
        (pos: number, text: string) =>
        ({ state, dispatch }: { state: any; dispatch: any }) => {
          const node = state.doc.nodeAt(pos)
          if (!node || node.type.name !== 'footnote') return false
          if (dispatch) {
            dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, text }))
          }
          return true
        }
    } as never
  },

  addNodeView() {
    // Rendered by hand so the visible number can come from document order
    // rather than a stored value that would go stale.
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('sup')
      dom.className = 'footnote-ref'
      dom.setAttribute('data-footnote', 'true')

      const paint = (): void => {
        let index = 0
        let mine = 0
        const at = typeof getPos === 'function' ? getPos() : -1
        editor.state.doc.descendants((n: any, pos: number) => {
          if (n.type.name !== 'footnote') return
          index += 1
          if (pos === at) mine = index
        })
        dom.textContent = String(mine || index || 1)
        dom.title = String(node.attrs.text ?? '')
      }

      paint()
      return {
        dom,
        update(updated: any) {
          if (updated.type.name !== 'footnote') return false
          paint()
          return true
        }
      }
    }
  }
})
