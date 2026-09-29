import { defineStore } from 'pinia'
import { ref } from 'vue'

export type FocusWidth = 'narrow' | 'medium' | 'wide'
export type DocsView = 'list' | 'grid'
export type PageView = 'paged' | 'continuous'
export type PageMargin = 'narrow' | 'normal' | 'wide'

const KEY = 'editorPrefs'

export const DEFAULT_EDITOR_SIZE = 16
export const EDITOR_SIZE_MIN = 12
export const EDITOR_SIZE_MAX = 32
export const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.4, 1.6] as const

/** A key plus modifiers, matched on the physical key so layouts and Shift don't matter. */
export interface Shortcut {
  ctrl: boolean
  alt: boolean
  shift: boolean
  /** KeyboardEvent.code, e.g. 'KeyJ', 'Digit1', 'Space'. */
  code: string
}

/** A configured wrap: typing `trigger` after the shortcut wraps in open/close. */
export interface WrapPair {
  trigger: string
  open: string
  close: string
}

/** A text expansion or an autocorrection, applied when a word is finished. */
export interface TextRule {
  from: string
  to: string
  /** 'correct' matches any capitalisation and keeps it (teh → the, Teh → The). */
  kind: 'expand' | 'correct'
}

export type MouseAction =
  | 'none'
  | 'enter'
  | 'shiftEnter'
  | 'undo'
  | 'redo'
  | 'escape'
  | 'tab'
  | 'back'
  | 'forward'

export const DEFAULT_WRAP_SHORTCUT: Shortcut = { ctrl: true, alt: false, shift: false, code: 'KeyJ' }
export const DEFAULT_WRAP_PAIRS: WrapPair[] = [{ trigger: '<', open: '⟨⟨', close: '⟩⟩' }]

const MOUSE_ACTIONS: MouseAction[] = [
  'none',
  'enter',
  'shiftEnter',
  'undo',
  'redo',
  'escape',
  'tab',
  'back',
  'forward'
]

function isShortcut(v: unknown): v is Shortcut {
  const o = v as Shortcut
  return !!o && typeof o.code === 'string' && !!o.code && typeof o.ctrl === 'boolean'
}

function cleanPairs(v: unknown): WrapPair[] | null {
  if (!Array.isArray(v)) return null
  return v
    .filter((p) => p && typeof p.trigger === 'string' && typeof p.open === 'string')
    .map((p) => ({ trigger: String(p.trigger), open: String(p.open), close: String(p.close ?? '') }))
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

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
  /** Writing text size in px for the manuscript and lore editors. */
  const editorFontSize = ref(DEFAULT_EDITOR_SIZE)
  /** Whole-interface scale — menus, sidebars and text alike. 1 is 100%. */
  const uiScale = ref(1)
  /** CSS family for the interface itself; empty means the system font. */
  const uiFont = ref('')
  const wrapShortcut = ref<Shortcut>({ ...DEFAULT_WRAP_SHORTCUT })
  const wrapPairs = ref<WrapPair[]>(DEFAULT_WRAP_PAIRS.map((p) => ({ ...p })))
  /** What the mouse's back (4) and forward (5) side buttons do. */
  const mouseBack = ref<MouseAction>('none')
  const mouseForward = ref<MouseAction>('none')
  /** What the scene-break button inserts. */
  const sceneBreakGlyph = ref('* * *')
  /** Writing statistics are collected only once the writer turns them on. */
  const statsEnabled = ref(false)
  /** Whether diary typing counts (numbers only — never text). */
  const statsIncludeDiary = ref(true)
  const textRules = ref<TextRule[]>([])
  const textRulesOn = ref(true)
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
        if (typeof raw.editorFontSize === 'number')
          editorFontSize.value = clamp(raw.editorFontSize, EDITOR_SIZE_MIN, EDITOR_SIZE_MAX)
        if (typeof raw.uiScale === 'number') uiScale.value = clamp(raw.uiScale, 0.75, 2)
        if (typeof raw.uiFont === 'string') uiFont.value = raw.uiFont
        if (isShortcut(raw.wrapShortcut)) wrapShortcut.value = { ...raw.wrapShortcut }
        const pairs = cleanPairs(raw.wrapPairs)
        if (pairs) wrapPairs.value = pairs
        if (MOUSE_ACTIONS.includes(raw.mouseBack as MouseAction))
          mouseBack.value = raw.mouseBack as MouseAction
        if (Array.isArray(raw.textRules))
          textRules.value = (raw.textRules as TextRule[])
            .filter((r) => r && typeof r.from === 'string' && r.from && typeof r.to === 'string')
            .map((r) => ({ from: r.from, to: r.to, kind: r.kind === 'correct' ? 'correct' : 'expand' }))
        if (typeof raw.textRulesOn === 'boolean') textRulesOn.value = raw.textRulesOn
        if (typeof raw.statsEnabled === 'boolean') statsEnabled.value = raw.statsEnabled
        if (typeof raw.statsIncludeDiary === 'boolean') statsIncludeDiary.value = raw.statsIncludeDiary
        if (typeof raw.sceneBreakGlyph === 'string' && raw.sceneBreakGlyph.trim())
          sceneBreakGlyph.value = raw.sceneBreakGlyph
        if (MOUSE_ACTIONS.includes(raw.mouseForward as MouseAction))
          mouseForward.value = raw.mouseForward as MouseAction
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
        pageMargin: pageMargin.value,
        editorFontSize: editorFontSize.value,
        uiScale: uiScale.value,
        uiFont: uiFont.value,
        wrapShortcut: wrapShortcut.value,
        wrapPairs: wrapPairs.value,
        mouseBack: mouseBack.value,
        mouseForward: mouseForward.value,
        sceneBreakGlyph: sceneBreakGlyph.value,
        statsEnabled: statsEnabled.value,
        statsIncludeDiary: statsIncludeDiary.value,
        textRules: textRules.value,
        textRulesOn: textRulesOn.value
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
  function setEditorFontSize(px: number): void {
    editorFontSize.value = clamp(Math.round(px), EDITOR_SIZE_MIN, EDITOR_SIZE_MAX)
    void persist()
  }
  function setUiScale(scale: number): void {
    uiScale.value = clamp(Math.round(scale * 100) / 100, 0.75, 2)
    void persist()
  }
  /** Moves one step along UI_SCALES — what Ctrl+= and Ctrl+- do. */
  function stepUiScale(direction: 1 | -1): void {
    const steps = [...UI_SCALES] as number[]
    const current = uiScale.value
    const next =
      direction > 0
        ? steps.find((s) => s > current + 0.001)
        : [...steps].reverse().find((s) => s < current - 0.001)
    if (next !== undefined) setUiScale(next)
  }
  function setUiFont(family: string): void {
    uiFont.value = family
    void persist()
  }
  function setWrapShortcut(shortcut: Shortcut): void {
    wrapShortcut.value = { ...shortcut }
    void persist()
  }
  function setWrapPairs(pairs: WrapPair[]): void {
    wrapPairs.value = pairs.map((p) => ({ ...p }))
    void persist()
  }
  function setMouseButton(which: 'back' | 'forward', action: MouseAction): void {
    if (which === 'back') mouseBack.value = action
    else mouseForward.value = action
    void persist()
  }
  function setSceneBreakGlyph(glyph: string): void {
    sceneBreakGlyph.value = glyph.trim() || '* * *'
    void persist()
  }
  function setTextRules(rules: TextRule[]): void {
    textRules.value = rules.map((r) => ({ ...r }))
    void persist()
  }
  function setTextRulesOn(on: boolean): void {
    textRulesOn.value = on
    void persist()
  }
  function setStatsEnabled(on: boolean): void {
    statsEnabled.value = on
    void persist()
  }
  function setStatsIncludeDiary(on: boolean): void {
    statsIncludeDiary.value = on
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
    editorFontSize,
    uiScale,
    uiFont,
    wrapShortcut,
    wrapPairs,
    mouseBack,
    mouseForward,
    sceneBreakGlyph,
    statsEnabled,
    statsIncludeDiary,
    textRules,
    textRulesOn,
    loaded,
    load,
    setAutosave,
    setSpellcheck,
    setFocusWidth,
    setDefaultAuthor,
    setEditorFont,
    setDocsView,
    setPageView,
    setPageMargin,
    setEditorFontSize,
    setUiScale,
    stepUiScale,
    setUiFont,
    setWrapShortcut,
    setWrapPairs,
    setMouseButton,
    setSceneBreakGlyph,
    setStatsEnabled,
    setStatsIncludeDiary,
    setTextRules,
    setTextRulesOn
  }
})
