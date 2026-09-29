import { defineStore } from 'pinia'
import { ref } from 'vue'
import { notesSince, LAST_SEEN_KEY, type ReleaseNote } from '@/lib/whatsNew'

/**
 * App-level state. Phase 1 only fetches the app version through the
 * secure bridge to prove main <-> renderer IPC works end to end.
 */
export const useAppStore = defineStore('app', () => {
  const version = ref<string>('')
  const ready = ref(false)
  // Distraction-free writing. Lives here rather than in a domain store because
  // it hides app-level chrome (the sidebar rail) as well as workspace chrome.
  const focusMode = ref(false)

  function setFocus(on: boolean): void {
    focusMode.value = on
  }
  function toggleFocus(): void {
    focusMode.value = !focusMode.value
  }

  async function init(): Promise<void> {
    try {
      version.value = await window.cypher.getVersion()
      ready.value = true
    } catch (error) {
      console.error('[app] init failed:', error)
    }
  }

  /** Release notes to show in the What's new dialog; empty means closed. */
  const whatsNew = ref<ReleaseNote[]>([])

  function showWhatsNew(notes: ReleaseNote[]): void {
    whatsNew.value = notes
  }

  /** Marks the running version as seen so the dialog does not return. */
  async function dismissWhatsNew(): Promise<void> {
    whatsNew.value = []
    if (!version.value) return
    try {
      await window.cypher.settings.set(LAST_SEEN_KEY, version.value)
    } catch {
      /* shows again next launch — harmless */
    }
  }

  /**
   * Opens the dialog once after an update.
   *
   * A fresh install has nothing to catch up on, so it records the version and
   * shows nothing. An existing install upgrading from before this dialog
   * existed has no marker yet either; main can tell the two apart by whether
   * the settings file was already there at launch.
   */
  async function checkWhatsNew(): Promise<void> {
    if (!version.value) return
    try {
      const stored = await window.cypher.settings.get(LAST_SEEN_KEY)
      const seen = typeof stored === 'string' ? stored : null
      if (seen === null && (await window.cypher.isFreshInstall())) {
        await window.cypher.settings.set(LAST_SEEN_KEY, version.value)
        return
      }
      const notes = notesSince(seen, version.value)
      if (notes.length) whatsNew.value = notes
      else if (seen !== version.value) await window.cypher.settings.set(LAST_SEEN_KEY, version.value)
    } catch {
      /* never block startup over release notes */
    }
  }

  return {
    version,
    ready,
    focusMode,
    setFocus,
    toggleFocus,
    init,
    whatsNew,
    showWhatsNew,
    dismissWhatsNew,
    checkWhatsNew
  }
})
