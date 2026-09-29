/**
 * Gives the mouse's side buttons (back = button 4, forward = button 5) a job.
 *
 * Most side buttons arrive as mouse buttons 3 and 4 in the page; some mice
 * (Logitech's software among them) send the keyboard's Browser Back / Forward
 * keys instead, so both are listened for. The chosen action is delivered to
 * whatever has focus as if it were typed, which is why Enter picks a mention
 * from the @ list, splits a paragraph in the editor and submits a dialog —
 * each place does what it would already do with a real Enter.
 */
import type { Router } from 'vue-router'
import { usePreferencesStore, type MouseAction } from '@/stores/preferences'

export const MOUSE_ACTION_LABELS: Record<MouseAction, string> = {
  none: 'Nothing',
  enter: 'Enter',
  shiftEnter: 'Line break (Shift+Enter)',
  undo: 'Undo',
  redo: 'Redo',
  escape: 'Escape',
  tab: 'Tab',
  back: 'Go back a page',
  forward: 'Go forward a page'
}

interface KeySpec {
  key: string
  code: string
  ctrlKey?: boolean
  shiftKey?: boolean
}

const KEYS: Partial<Record<MouseAction, KeySpec>> = {
  enter: { key: 'Enter', code: 'Enter' },
  shiftEnter: { key: 'Enter', code: 'Enter', shiftKey: true },
  undo: { key: 'z', code: 'KeyZ', ctrlKey: true },
  redo: { key: 'y', code: 'KeyY', ctrlKey: true },
  escape: { key: 'Escape', code: 'Escape' },
  tab: { key: 'Tab', code: 'Tab' }
}

function isTextField(el: Element | null): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
}

/**
 * Sends a key to the focused element. Editors and dialogs handle key events
 * themselves; when nothing claims it, the browser's own editing command is
 * used so a plain text box still gets its new line or undo.
 */
function sendKey(action: MouseAction): void {
  const spec = KEYS[action]
  if (!spec) return
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  const init: KeyboardEventInit = { ...spec, bubbles: true, cancelable: true, composed: true }
  const unhandled = target.dispatchEvent(new KeyboardEvent('keydown', init))
  target.dispatchEvent(new KeyboardEvent('keyup', init))
  if (!unhandled) return

  const editable = isTextField(target) || target.isContentEditable
  switch (action) {
    case 'enter':
    case 'shiftEnter':
      if (target instanceof HTMLTextAreaElement) document.execCommand('insertText', false, '\n')
      else if (target instanceof HTMLInputElement) target.form?.requestSubmit()
      else if (target.isContentEditable)
        document.execCommand(action === 'enter' ? 'insertParagraph' : 'insertLineBreak')
      else if (target instanceof HTMLButtonElement) target.click()
      break
    case 'undo':
    case 'redo':
      if (editable) document.execCommand(action)
      break
    case 'tab':
      if (target instanceof HTMLTextAreaElement) document.execCommand('insertText', false, '\t')
      break
    default:
      break
  }
}

function perform(action: MouseAction, router: Router): void {
  if (action === 'none') return
  if (action === 'back') router.back()
  else if (action === 'forward') router.forward()
  else sendKey(action)
}

let installed = false
let lastFired = 0

export function installMouseButtons(router: Router): void {
  if (installed) return
  installed = true

  const actionFor = (which: 'back' | 'forward'): MouseAction => {
    const prefs = usePreferencesStore()
    return which === 'back' ? prefs.mouseBack : prefs.mouseForward
  }
  const sideOf = (button: number): 'back' | 'forward' | null =>
    button === 3 ? 'back' : button === 4 ? 'forward' : null

  // Pressing a side button can move focus or start the platform's own
  // back/forward; stopping the press keeps the caret where it is.
  window.addEventListener(
    'mousedown',
    (e) => {
      const side = sideOf(e.button)
      if (side && actionFor(side) !== 'none') e.preventDefault()
    },
    true
  )

  window.addEventListener(
    'mouseup',
    (e) => {
      const side = sideOf(e.button)
      if (!side) return
      const action = actionFor(side)
      if (action === 'none') return
      e.preventDefault()
      e.stopPropagation()
      lastFired = Date.now()
      perform(action, router)
    },
    true
  )

  window.addEventListener(
    'keydown',
    (e) => {
      const side = e.key === 'BrowserBack' ? 'back' : e.key === 'BrowserForward' ? 'forward' : null
      if (!side || !e.isTrusted) return
      const action = actionFor(side)
      if (action === 'none') return
      e.preventDefault()
      // A mouse whose driver sends both a button and a key shouldn't act twice.
      if (Date.now() - lastFired < 150) return
      lastFired = Date.now()
      perform(action, router)
    },
    true
  )
}
