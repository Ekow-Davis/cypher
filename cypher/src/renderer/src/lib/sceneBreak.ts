import { Node, mergeAttributes } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

/**
 * A scene break: a centred ornament between scenes.
 *
 * It is a node of its own rather than a paragraph reading "* * *" so exports
 * can centre and space it properly and the manuscript can tell a scene change
 * from ordinary text. It is only ever inserted by the toolbar button or the
 * command palette — there is deliberately no input rule, so a writer who
 * types their own asterisks, dashes or hashes keeps exactly what they typed.
 */
export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      glyph: {
        default: '* * *',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-glyph') || el.textContent?.trim() || '* * *',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-glyph': attrs.glyph })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="scene-break"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'scene-break',
        class: 'cypher-scene-break',
        contenteditable: 'false'
      }),
      String(node.attrs.glyph || '* * *')
    ]
  },

  renderText({ node }) {
    return `\n${node.attrs.glyph || '* * *'}\n`
  },

  addCommands() {
    return {
      insertSceneBreak:
        (glyph?: string) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs: { glyph: glyph || '* * *' } })
            // Land the caret in the paragraph after the break, creating one at
            // the end of the chapter, so writing carries straight on.
            .command(({ tr, dispatch, state }) => {
              if (!dispatch) return true
              const { $to } = tr.selection
              if ($to.nodeAfter?.isTextblock) {
                tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1))
              } else if (!$to.nodeAfter) {
                const para = state.schema.nodes.paragraph?.create()
                if (para) {
                  const at = $to.end()
                  tr.insert(at, para)
                  tr.setSelection(TextSelection.create(tr.doc, at + 1))
                }
              }
              tr.scrollIntoView()
              return true
            })
            .run()
    }
  }
})
