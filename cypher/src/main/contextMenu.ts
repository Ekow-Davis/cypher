import { Menu, MenuItem, BrowserWindow, session } from 'electron'

/**
 * Right-click menu for editable text: spelling corrections, dictionary
 * management, and a hook into the thesaurus.
 *
 * Chromium reports the misspelled word and its suggestions on the context-menu
 * event itself, so corrections come from the same dictionaries the underline
 * uses — no second spellchecker to disagree with the first.
 */

const DEFAULT_LANGUAGE = 'en-US'

export function initSpellcheck(): void {
  const ses = session.defaultSession
  try {
    const available = ses.availableSpellCheckerLanguages
    if (available.includes(DEFAULT_LANGUAGE)) {
      ses.setSpellCheckerLanguages([DEFAULT_LANGUAGE])
    }
    ses.setSpellCheckerEnabled(true)
  } catch {
    /* platform without a bundled dictionary; the menu simply shows no suggestions */
  }
}

export function attachContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu()
    const { isEditable, selectionText, misspelledWord, dictionarySuggestions } = params

    // Spelling corrections first — they are why the menu was opened.
    if (isEditable && misspelledWord) {
      for (const suggestion of dictionarySuggestions.slice(0, 6)) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => window.webContents.replaceMisspelling(suggestion)
          })
        )
      }
      if (dictionarySuggestions.length === 0) {
        menu.append(new MenuItem({ label: 'No suggestions', enabled: false }))
      }
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(
        new MenuItem({
          label: `Add “${misspelledWord}” to dictionary`,
          click: () => session.defaultSession.addWordToSpellCheckerDictionary(misspelledWord)
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }

    const word = selectionText.trim()
    // One word selected is the only case where a thesaurus makes sense.
    if (word && !word.includes(' ') && word.length > 1) {
      menu.append(
        new MenuItem({
          label: `Synonyms for “${word}”`,
          click: () => window.webContents.send('thesaurus:lookup', word)
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }

    if (isEditable) {
      menu.append(new MenuItem({ role: 'undo' }))
      menu.append(new MenuItem({ role: 'redo' }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ role: 'cut', enabled: !!selectionText }))
    }
    menu.append(new MenuItem({ role: 'copy', enabled: !!selectionText }))
    if (isEditable) {
      menu.append(new MenuItem({ role: 'paste' }))
      menu.append(new MenuItem({ role: 'selectAll' }))
    }

    if (menu.items.length) menu.popup({ window })
  })
}

/**
 * Words the writer has taught the dictionary — names, invented terms, and so
 * on. Electron reads these from disk, so the call is asynchronous.
 */
export async function customWords(): Promise<string[]> {
  try {
    return await session.defaultSession.listWordsInSpellCheckerDictionary()
  } catch {
    return []
  }
}

export function addCustomWord(word: string): boolean {
  try {
    return session.defaultSession.addWordToSpellCheckerDictionary(word.trim())
  } catch {
    return false
  }
}

export function removeCustomWord(word: string): boolean {
  try {
    return session.defaultSession.removeWordFromSpellCheckerDictionary(word.trim())
  } catch {
    return false
  }
}

export function spellcheckLanguages(): { current: string[]; available: string[] } {
  try {
    return {
      current: session.defaultSession.getSpellCheckerLanguages(),
      available: session.defaultSession.availableSpellCheckerLanguages
    }
  } catch {
    return { current: [], available: [] }
  }
}

export function setSpellcheckLanguages(languages: string[]): void {
  try {
    session.defaultSession.setSpellCheckerLanguages(languages)
  } catch {
    /* ignore an unsupported language */
  }
}

export function setSpellcheckEnabled(enabled: boolean): void {
  session.defaultSession.setSpellCheckerEnabled(enabled)
}

export function isSpellcheckEnabled(): boolean {
  try {
    return session.defaultSession.isSpellCheckerEnabled()
  } catch {
    return false
  }
}
