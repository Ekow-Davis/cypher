import { defineStore } from 'pinia'
import { ref } from 'vue'

export type FocusWidth = 'narrow' | 'medium' | 'wide'

const KEY = 'editorPrefs'

/** Editor preferences that actually take effect in the writing surfaces. */
export const usePreferencesStore = defineStore('preferences', () => {
  const autosaveMs = ref(600)
  const spellcheck = ref(true)
  const focusWidth = ref<FocusWidth>('medium')
  const defaultAuthor = ref('')
  const loaded = ref(false)

  async function load(): Promise<void> {
    try {
      const raw = (await window.cypher.settings.get(KEY)) as Record<string, unknown> | null
      if (raw && typeof raw === 'object') {
        if (typeof raw.autosaveMs === 'number') autosaveMs.value = raw.autosaveMs
        if (typeof raw.spellcheck === 'boolean') spellcheck.value = raw.spellcheck
        if (raw.focusWidth) focusWidth.value = raw.focusWidth as FocusWidth
        if (typeof raw.defaultAuthor === 'string') defaultAuthor.value = raw.defaultAuthor
      }
    } catch {
      /* first run */
    }
    loaded.value = true
  }

  async function persist(): Promise<void> {
    try {
      await window.cypher.settings.set(KEY, {
        autosaveMs: autosaveMs.value,
        spellcheck: spellcheck.value,
        focusWidth: focusWidth.value,
        defaultAuthor: defaultAuthor.value
      })
    } catch {
      /* non-fatal */
    }
  }

  function setAutosave(ms: number): void {
    autosaveMs.value = ms
    void persist()
  }
  function setSpellcheck(on: boolean): void {
    spellcheck.value = on
    void persist()
  }
  function setDefaultAuthor(name: string): void {
    defaultAuthor.value = name
    void persist()
  }
  function setFocusWidth(w: FocusWidth): void {
    focusWidth.value = w
    void persist()
  }

  return {
    autosaveMs,
    spellcheck,
    focusWidth,
    defaultAuthor,
    loaded,
    load,
    setAutosave,
    setSpellcheck,
    setFocusWidth,
    setDefaultAuthor
  }
})
