/**
 * Text expansion and autocorrect.
 *
 * Both fire when a word is finished — a space, punctuation or Enter typed
 * straight after it — never mid-word, so nothing changes under the cursor
 * while you're still typing. Pressing Backspace immediately afterwards puts
 * back exactly what you typed, for the times you meant it.
 *
 *   expand  — ";cc" → "The Crimson Chapel" (exact match)
 *   correct — "teh" → "the", matching any capitalisation and keeping it
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { usePreferencesStore, type TextRule } from '@/stores/preferences'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Characters that finish a word. Apostrophes don't — they sit inside words (don't). */
export const BOUNDARY = /^[\s.,;:!?)\]}"”»…—–]$/u
const WORD_CHAR = /[\p{L}\p{N}]/u

export const SUGGESTED_RULES: TextRule[] = [
  { from: 'teh', to: 'the', kind: 'correct' },
  { from: 'adn', to: 'and', kind: 'correct' },
  { from: 'taht', to: 'that', kind: 'correct' },
  { from: 'recieve', to: 'receive', kind: 'correct' },
  { from: 'seperate', to: 'separate', kind: 'correct' },
  { from: 'definately', to: 'definitely', kind: 'correct' },
  { from: 'occured', to: 'occurred', kind: 'correct' },
  { from: 'untill', to: 'until', kind: 'correct' },
  { from: 'wierd', to: 'weird', kind: 'correct' },
  { from: 'alot', to: 'a lot', kind: 'correct' },
  { from: '--', to: '—', kind: 'expand' },
  { from: '...', to: '…', kind: 'expand' },
  { from: '->', to: '→', kind: 'expand' },
  { from: '(c)', to: '©', kind: 'expand' }
]

function activeRules(): TextRule[] {
  try {
    const prefs = usePreferencesStore()
    if (!prefs.textRulesOn) return []
    // Longest first, so ";ccx" wins over ";cc".
    return [...prefs.textRules].filter((r) => r.from).sort((a, b) => b.from.length - a.from.length)
  } catch {
    return []
  }
}

/** Carries the capitalisation of what was typed onto the correction. */
function matchCase(typed: string, replacement: string): string {
  if (typed === typed.toUpperCase() && typed !== typed.toLowerCase() && typed.length > 1) return replacement.toUpperCase()
  if (typed[0] && typed[0] === typed[0].toUpperCase() && typed[0] !== typed[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/** The rule that applies to the end of `before`, and what replaces it. */
export function findRule(before: string): { length: number; replacement: string } | null {
  for (const rule of activeRules()) {
    const n = rule.from.length
    const tail = before.slice(-n)
    const hit = rule.kind === 'correct' ? tail.toLowerCase() === rule.from.toLowerCase() : tail === rule.from
    if (!hit) continue
    // A rule starting with a letter must start a word: "steh" is not "teh".
    const prev = before.slice(0, -n).slice(-1)
    if (WORD_CHAR.test(rule.from[0]) && prev && WORD_CHAR.test(prev)) continue
    return { length: n, replacement: rule.kind === 'correct' ? matchCase(tail, rule.to) : rule.to }
  }
  return null
}

const key = new PluginKey<{ from: number; to: number; original: string } | null>('cypherTextRules')

function textBefore(state: any, pos: number): string {
  const $pos = state.doc.resolve(pos)
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return ''
  return $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼')
}

export const TextRules = Extension.create({
  name: 'cypherTextRules',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(key)
            if (meta !== undefined) return meta
            return tr.docChanged || tr.selectionSet ? null : value
          }
        },
        props: {
          handleTextInput(view, from, to, text) {
            if (!BOUNDARY.test(text) || from !== to) return false
            const before = textBefore(view.state, from)
            const hit = findRule(before)
            if (!hit) return false
            const start = from - hit.length
            const marks = view.state.doc.resolve(from).marks()
            const insert = hit.replacement + text
            const tr = view.state.tr.replaceWith(start, to, view.state.schema.text(insert, marks))
            tr.setMeta(key, { from: start, to: start + insert.length, original: before.slice(-hit.length) + text })
            view.dispatch(tr)
            return true
          },
          handleKeyDown(view, event) {
            const { state } = view
            if (event.key === 'Backspace') {
              const undo = key.getState(state)
              const sel = state.selection
              if (undo && sel.empty && sel.from === undo.to) {
                const marks = state.doc.resolve(undo.from).marks()
                const tr = state.tr.replaceWith(undo.from, undo.to, state.schema.text(undo.original, marks))
                tr.setMeta(key, null)
                view.dispatch(tr)
                return true
              }
              return false
            }
            // Enter also finishes a word; replace, then let Enter carry on.
            if (event.key === 'Enter' && !event.shiftKey && state.selection.empty) {
              const from = state.selection.from
              const hit = findRule(textBefore(state, from))
              if (hit) {
                const marks = state.doc.resolve(from).marks()
                view.dispatch(
                  state.tr.replaceWith(from - hit.length, from, state.schema.text(hit.replacement, marks))
                )
              }
            }
            return false
          }
        }
      })
    ]
  }
})

let installed = false

/**
 * Plain text boxes (the diary, notes) get the same treatment. The edit goes
 * through execCommand so it lands on the box's own undo stack and fires the
 * input event its autosave listens for.
 */
export function installTextRulesForFields(): void {
  if (installed) return
  installed = true
  window.addEventListener(
    'beforeinput',
    (e: InputEvent) => {
      const el = e.target
      if (!(el instanceof HTMLTextAreaElement) || el.readOnly) return
      if (e.inputType !== 'insertText' || !e.data || !BOUNDARY.test(e.data)) return
      const start = el.selectionStart ?? 0
      if (start !== el.selectionEnd) return
      const lineStart = el.value.lastIndexOf('\n', start - 1) + 1
      const hit = findRule(el.value.slice(lineStart, start))
      if (!hit) return
      e.preventDefault()
      el.setSelectionRange(start - hit.length, start)
      document.execCommand('insertText', false, hit.replacement + e.data)
    },
    true
  )
}
