import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const findKey = new PluginKey('cypherFind')

export interface Match {
  from: number
  to: number
}

interface FindState {
  matches: Match[]
  active: number
  decorations: DecorationSet
}

/** Collects every occurrence of `query` with document positions. */
export function findMatches(state: EditorState, query: string, caseSensitive: boolean): Match[] {
  const matches: Match[] = []
  const needle = caseSensitive ? query : query.toLowerCase()
  if (!needle) return matches

  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const hay = caseSensitive ? node.text : node.text.toLowerCase()
    let index = hay.indexOf(needle)
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + needle.length })
      index = hay.indexOf(needle, index + needle.length)
    }
  })
  return matches
}

/**
 * Highlights search hits without touching the document. Matches live in plugin
 * state and are pushed in by the UI, so searching never creates an undo step —
 * only an actual replace does.
 */
export const FindReplace = Extension.create({
  name: 'cypherFind',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ matches: [], active: 0, decorations: DecorationSet.empty }),
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(findKey) as
              | { matches: Match[]; active: number }
              | undefined

            if (meta) {
              const decorations = DecorationSet.create(
                newState.doc,
                meta.matches.map((m, i) =>
                  Decoration.inline(m.from, m.to, {
                    class: i === meta.active ? 'find-hit find-hit-active' : 'find-hit'
                  })
                )
              )
              return { matches: meta.matches, active: meta.active, decorations }
            }

            if (tr.docChanged) {
              return {
                matches: value.matches.map((m) => ({
                  from: tr.mapping.map(m.from),
                  to: tr.mapping.map(m.to)
                })),
                active: value.active,
                decorations: value.decorations.map(tr.mapping, tr.doc)
              }
            }
            return value
          }
        },
        props: {
          decorations(state) {
            return findKey.getState(state)?.decorations ?? DecorationSet.empty
          }
        }
      })
    ]
  }
})
