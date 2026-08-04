import { defineStore } from 'pinia'
import { ref } from 'vue'

export type FocusWidth = 'narrow' | 'medium' | 'wide'
export type DocsView = 'list' | 'grid'
export type PageView = 'paged' | 'continuous'
export type PageMargin = 'narrow' | 'normal' | 'wide'

const KEY = 'editorPrefs'

/** Editor preferences that actually take effect in the writing surfaces. */
export const usePreferencesStore = defineStore('preferences', () => {
  const autosaveMs = ref(600)
  const spellcheck = ref(true)
  const focusWidth = ref<FocusWidth>('medium')
  const defaultAuthor = ref('')
  /** CSS family used by the manuscript and lore editors. */
  const editorFont = ref('')
  const docsView = ref<DocsView>('list')
  const pageView = ref<PageView>('paged')
  const pageMargin = ref<PageMargin>('normal')
  const loaded = ref(false)

  async function load(): Promise<void> {
    try {
      const raw = (await window.cypher.settings.get(KEY)) as Record<string, unknown> | null
      if (raw && typeof raw === 'object') {
        if (typeof raw.autosaveMs === 'number') autosaveMs.value = raw.autosaveMs
        if (typeof raw.spellcheck === 'boolean') spellcheck.value = raw.spellcheck
        if (raw.focusWidth) focusWidth.value = raw.focusWidth as FocusWidth
        if (typeof raw.defaultAuthor === 'string') defaultAuthor.value = raw.defaultAuthor
        if (typeof raw.editorFont === 'string') editorFont.value = raw.editorFont
        if (raw.docsView === 'grid' || raw.docsView === 'list') docsView.value = raw.docsView
        if (raw.pageView === 'paged' || raw.pageView === 'continuous') pageView.value = raw.pageView
        if (raw.pageMargin === 'narrow' || raw.pageMargin === 'normal' || raw.pageMargin === 'wide')
          pageMargin.value = raw.pageMargin as PageMargin
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
        defaultAuthor: defaultAuthor.value,
        editorFont: editorFont.value,
        docsView: docsView.value,
        pageView: pageView.value,
        pageMargin: pageMargin.value
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
  function setPageMargin(v: PageMargin): void {
    pageMargin.value = v
    void persist()
  }
  function setPageView(v: PageView): void {
    pageView.value = v
    void persist()
  }
  function setDocsView(v: DocsView): void {
    docsView.value = v
    void persist()
  }
  function setEditorFont(family: string): void {
    editorFont.value = family
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
    editorFont,
    docsView,
    pageView,
    pageMargin,
    loaded,
    load,
    setAutosave,
    setSpellcheck,
    setFocusWidth,
    setDefaultAuthor,
    setEditorFont,
    setDocsView,
    setPageView,
    setPageMargin
  }
})
