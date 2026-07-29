import { defineStore } from 'pinia'
import { ref } from 'vue'

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

  return { version, ready, focusMode, setFocus, toggleFocus, init }
})
