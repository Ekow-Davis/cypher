/**
 * Wrap the selection in a pair of strings: select, press the wrap shortcut,
 * then type a character.
 *
 * Two keystrokes rather than one chord per pair, because the pairs people want
 * are mostly symbols — `%`, `$`, `"` — that already need Shift, and a chord
 * like Ctrl+Shift+5 is both awkward and layout-dependent. After the shortcut
 * the next key is read as the character it *types*, so `%` is simply `%`.
 *
 *   configured trigger  → its pair         (`<` → ⟨⟨ … ⟩⟩ by default)
 *   an opening bracket  → it and its closer (`(` → ( … ), `“` → “ … ”)
 *   any other character → itself both sides (`$` → $ … $)
 *   Enter               → type a one-off pair
 *   Esc                 → cancel
 *
 * Works in every Tiptap editor (manuscript, lore, documents) and in plain text
 * boxes (diary, notes), because it listens at the window and acts on whatever
 * has focus rather than being wired into each editor.
 */
import { reactive } from 'vue'
import { TextSelection } from '@tiptap/pm/state'
import { usePreferencesStore, type Shortcut, type WrapPair } from '@/stores/preferences'

/* eslint-disable @typescript-eslint/no-explicit-any */

type Target =
  | { kind: 'editor'; editor: any; from: number; to: number }
  | { kind: 'field'; el: HTMLTextAreaElement | HTMLInputElement; start: number; end: number }

/** Drives WrapHint.vue. */
export const wrapUi = reactive({
  /** Waiting for the character that picks the pair. */
  armed: false,
  /** Showing the one-off pair form. */
  custom: false,
  x: 0,
  y: 0
})

let target: Target | null = null
let disarmTimer: ReturnType<typeof setTimeout> | undefined

const BRACKETS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>',
  '“': '”',
  '‘': '’',
  '«': '»',
  '‹': '›',
  '⟨': '⟩',
  '「': '」',
  '『': '』'
}
const CLOSERS: Record<string, string> = Object.fromEntries(
  Object.entries(BRACKETS).map(([open, close]) => [close, open])
)

/** The closing half for an opening string: brackets flipped, order reversed. */
export function mirror(open: string): string {
  return [...open]
    .reverse()
    .map((c) => BRACKETS[c] ?? c)
    .join('')
}

/** The pair a typed character stands for. */
export function pairFor(char: string, pairs: WrapPair[]): { open: string; close: string } {
  const configured = pairs.find((p) => p.trigger === char)
  if (configured) return { open: configured.open, close: configured.close }
  if (BRACKETS[char]) return { open: char, close: BRACKETS[char] }
  if (CLOSERS[char]) return { open: CLOSERS[char], close: char }
  return { open: char, close: char }
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock'])

export function shortcutMatches(e: KeyboardEvent, s: Shortcut): boolean {
  return (
    e.code === s.code &&
    (e.ctrlKey || e.metaKey) === s.ctrl &&
    e.altKey === s.alt &&
    e.shiftKey === s.shift
  )
}

/** "Ctrl+Shift+J" — for display only; matching uses the physical key code. */
export function shortcutLabel(s: Shortcut): string {
  const parts: string[] = []
  if (s.ctrl) parts.push('Ctrl')
  if (s.alt) parts.push('Alt')
  if (s.shift) parts.push('Shift')
  parts.push(codeLabel(s.code))
  return parts.join('+')
}

function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  const named: Record<string, string> = {
    Space: 'Space',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/'
  }
  return named[code] ?? code
}

/** Whatever editable thing has focus, with its current selection. */
function captureTarget(): Target | null {
  const active = document.activeElement as HTMLElement | null
  if (!active) return null

  const pm = active.closest?.('.ProseMirror') as (HTMLElement & { editor?: any }) | null
  if (pm?.editor && pm.editor.isEditable) {
    const { from, to } = pm.editor.state.selection
    return { kind: 'editor', editor: pm.editor, from, to }
  }

  if (active instanceof HTMLTextAreaElement && !active.readOnly && !active.disabled) {
    return { kind: 'field', el: active, start: active.selectionStart ?? 0, end: active.selectionEnd ?? 0 }
  }
  if (
    active instanceof HTMLInputElement &&
    !active.readOnly &&
    !active.disabled &&
    /^(text|search|)$/.test(active.type)
  ) {
    return { kind: 'field', el: active, start: active.selectionStart ?? 0, end: active.selectionEnd ?? 0 }
  }
  return null
}

function positionFor(t: Target): { x: number; y: number } {
  try {
    if (t.kind === 'editor') {
      const c = t.editor.view.coordsAtPos(t.from)
      return { x: c.left, y: c.bottom + 6 }
    }
    const r = t.el.getBoundingClientRect()
    return { x: r.left + 8, y: Math.min(r.bottom, window.innerHeight - 60) + 4 }
  } catch {
    return { x: window.innerWidth / 2 - 120, y: 80 }
  }
}

function disarm(): void {
  clearTimeout(disarmTimer)
  wrapUi.armed = false
  wrapUi.custom = false
}

/** Abandons the one-off form and puts focus back where it was. */
export function cancelWrap(): void {
  const t = target
  disarm()
  target = null
  if (t?.kind === 'editor') t.editor.commands.focus()
  else t?.el.focus()
}

/**
 * Wraps the captured selection. With nothing selected it inserts the pair and
 * leaves the caret between the halves, ready to type into. The wrapped text
 * stays selected afterwards, so wrapping again nests.
 */
export function applyWrap(open: string, close: string): void {
  const t = target
  disarm()
  target = null
  if (!t || (!open && !close)) return

  if (t.kind === 'editor') {
    const { from, to } = t
    t.editor
      .chain()
      .focus()
      .command(({ tr }: { tr: any }) => {
        // Closing half first, so the opening position is still valid.
        if (close) tr.insertText(close, to)
        if (open) tr.insertText(open, from)
        const a = from + open.length
        const b = to + open.length
        tr.setSelection(TextSelection.create(tr.doc, a, b))
        return true
      })
      .run()
    return
  }

  // execCommand keeps the edit on the field's own undo stack and fires the
  // input event that v-model and autosave listen for.
  const { el, start, end } = t
  el.focus()
  el.setSelectionRange(end, end)
  if (close) document.execCommand('insertText', false, close)
  el.setSelectionRange(start, start)
  if (open) document.execCommand('insertText', false, open)
  el.setSelectionRange(start + open.length, end + open.length)
}

/** Opens the one-off pair form (Enter while armed, or from the hint). */
export function startCustomWrap(): void {
  if (!target) return
  clearTimeout(disarmTimer)
  wrapUi.armed = false
  wrapUi.custom = true
}

function onKeyDown(e: KeyboardEvent): void {
  const prefs = usePreferencesStore()

  if (wrapUi.armed) {
    if (MODIFIER_KEYS.has(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      cancelWrap()
      return
    }
    if (e.key === 'Enter') {
      startCustomWrap()
      return
    }
    // A printable character (AltGr combinations included). A plain Ctrl
    // chord is not a character, so it cancels instead.
    const printable = [...e.key].length === 1 && !e.metaKey && !(e.ctrlKey && !e.altKey)
    if (printable) {
      const { open, close } = pairFor(e.key, prefs.wrapPairs)
      applyWrap(open, close)
    } else {
      cancelWrap()
    }
    return
  }

  if (wrapUi.custom) return
  if (!shortcutMatches(e, prefs.wrapShortcut)) return
  const t = captureTarget()
  if (!t) return
  e.preventDefault()
  e.stopPropagation()
  target = t
  const at = positionFor(t)
  wrapUi.x = Math.max(8, Math.min(at.x, window.innerWidth - 300))
  wrapUi.y = Math.min(at.y, window.innerHeight - 90)
  wrapUi.armed = true
  clearTimeout(disarmTimer)
  disarmTimer = setTimeout(() => {
    if (wrapUi.armed) cancelWrap()
  }, 5000)
}

let installed = false

export function installWrap(): void {
  if (installed) return
  installed = true
  // Capture phase: runs before the editors' own key handling, so the
  // character after the shortcut never reaches the document.
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener(
    'mousedown',
    (e) => {
      // Clicking one of the hint's own pair chips is a choice, not a cancel.
      if ((e.target as HTMLElement | null)?.closest?.('[data-wrap-hint]')) return
      if (wrapUi.armed) cancelWrap()
      else if (wrapUi.custom) {
        // Clicked away from the form: close it and leave focus where it lands.
        disarm()
        target = null
      }
    },
    true
  )
}
