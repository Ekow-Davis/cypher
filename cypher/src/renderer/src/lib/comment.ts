import { Mark, mergeAttributes } from '@tiptap/core'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A comment anchor.
 *
 * Held as a mark carrying an id rather than a stored document position: marks
 * are remapped by ProseMirror through every edit, so a comment stays attached
 * to its text no matter what is typed around it. Positions would drift the
 * moment anything above them changed.
 */
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.commentId ? { 'data-comment-id': String(attrs.commentId) } : {}
      },
      resolved: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.resolved ? { 'data-resolved': 'true' } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-anchor' }), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }: { commands: any }) =>
          commands.setMark('comment', { commentId }),
      unsetComment:
        (commentId: string) =>
        ({ state, dispatch }: { state: any; dispatch: any }) => {
          const type = state.schema.marks.comment
          const tr = state.tr
          let found = false
          state.doc.descendants((node: any, pos: number) => {
            const mark = node.marks?.find(
              (m: any) => m.type === type && m.attrs.commentId === commentId
            )
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, type)
              found = true
            }
          })
          if (found && dispatch) dispatch(tr)
          return found
        },
      markCommentResolved:
        (commentId: string, resolved: boolean) =>
        ({ state, dispatch }: { state: any; dispatch: any }) => {
          const type = state.schema.marks.comment
          const tr = state.tr
          let found = false
          state.doc.descendants((node: any, pos: number) => {
            const mark = node.marks?.find(
              (m: any) => m.type === type && m.attrs.commentId === commentId
            )
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, type)
              tr.addMark(pos, pos + node.nodeSize, type.create({ commentId, resolved }))
              found = true
            }
          })
          if (found && dispatch) dispatch(tr)
          return found
        }
    } as never
  }
})

/** Finds where a comment's text currently sits, for scroll-to. */
export function findCommentPos(state: any, commentId: string): number | null {
  const type = state.schema.marks.comment
  let pos: number | null = null
  state.doc.descendants((node: any, at: number) => {
    if (pos !== null) return false
    const mark = node.marks?.find(
      (m: any) => m.type === type && m.attrs.commentId === commentId
    )
    if (mark) pos = at
    return undefined
  })
  return pos
}
