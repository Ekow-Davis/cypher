import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { deriveAccent } from '@/lib/color'

export type Mode = 'light' | 'dark'
export type AccentName = 'purple' | 'blue' | 'green' | 'teal' | 'slate' | 'custom'
export type DomainKey = 'diary' | 'document' | 'book'
export type Scope = 'global' | DomainKey

export const PRESET_ACCENTS: Exclude<AccentName, 'custom'>[] = [
  'purple',
  'blue',
  'green',
  'teal',
  'slate'
]

/** Display swatch colours (fixed, independent of the active mode). */
export const ACCENT_COLORS: Record<Exclude<AccentName, 'custom'>, string> = {
  purple: '#8b7bd6',
  blue: '#5b8def',
  green: '#46ae7c',
  teal: '#3bb6c1',
  slate: '#8b94a8'
}

interface GlobalTheme {
  mode: Mode
  accent: AccentName
  customHex: string | null
}
interface DomainTheme {
  mode: Mode | null // null = inherit from global
  accent: AccentName | null // null = inherit from global
  customHex: string | null
}

const STORAGE_KEY = 'theme'

function emptyDomain(): DomainTheme {
  return { mode: null, accent: null, customHex: null }
}

export const useThemeStore = defineStore('theme', () => {
  const global = reactive<GlobalTheme>({ mode: 'dark', accent: 'purple', customHex: null })
  const domains = reactive<Record<DomainKey, DomainTheme>>({
    diary: emptyDomain(),
    document: emptyDomain(),
    book: emptyDomain()
  })

  // Which domain the user is currently viewing (set from the router).
  const activeDomain = ref<DomainKey | null>(null)
  // While editing in Settings, preview a specific scope live.
  const previewScope = ref<DomainKey | null>(null)
  const loaded = ref(false)

  function choiceFor(scope: Scope): GlobalTheme | DomainTheme {
    return scope === 'global' ? global : domains[scope]
  }

  function resolve(scope: Scope): { mode: Mode; accent: AccentName; customHex: string | null } {
    if (scope === 'global') {
      return {
        mode: global.mode,
        accent: global.accent,
        customHex: global.accent === 'custom' ? global.customHex : null
      }
    }
    const d = domains[scope]
    const accent = d.accent ?? global.accent
    const customHex =
      accent === 'custom' ? (d.accent === 'custom' ? d.customHex : global.customHex) : null
    return { mode: d.mode ?? global.mode, accent, customHex }
  }

  function apply(): void {
    const scope: Scope = previewScope.value ?? activeDomain.value ?? 'global'
    const { mode, accent, customHex } = resolve(scope)
    const root = document.documentElement
    root.dataset.mode = mode
    if (accent === 'custom' && customHex) {
      const d = deriveAccent(customHex)
      root.dataset.accent = 'custom'
      root.style.setProperty('--color-accent', d.accent)
      root.style.setProperty('--color-accent-strong', d.strong)
      root.style.setProperty('--color-on-accent', d.onAccent)
    } else {
      root.dataset.accent = accent === 'custom' ? 'purple' : accent
      root.style.removeProperty('--color-accent')
      root.style.removeProperty('--color-accent-strong')
      root.style.removeProperty('--color-on-accent')
    }
  }

  function snapshot(): unknown {
    return {
      global: { ...global },
      domains: {
        diary: { ...domains.diary },
        document: { ...domains.document },
        book: { ...domains.book }
      }
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function save(): void {
    if (!loaded.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void window.cypher.settings.set(STORAGE_KEY, snapshot())
    }, 150)
  }

  async function load(): Promise<void> {
    try {
      const saved = (await window.cypher.settings.get(STORAGE_KEY)) as {
        global?: Partial<GlobalTheme>
        domains?: Partial<Record<DomainKey, Partial<DomainTheme>>>
      } | null
      if (saved?.global) Object.assign(global, saved.global)
      if (saved?.domains) {
        for (const k of ['diary', 'document', 'book'] as DomainKey[]) {
          if (saved.domains[k]) Object.assign(domains[k], saved.domains[k])
        }
      }
    } catch (error) {
      console.error('[theme] load failed:', error)
    } finally {
      loaded.value = true
      apply()
    }
  }

  function setMode(scope: Scope, mode: Mode | null): void {
    if (scope === 'global') {
      if (mode) global.mode = mode
    } else {
      domains[scope].mode = mode
    }
  }
  function setAccent(scope: Scope, accent: AccentName | null): void {
    if (scope === 'global') {
      if (accent) global.accent = accent
    } else {
      domains[scope].accent = accent
    }
  }
  function setCustom(scope: Scope, hex: string): void {
    if (scope === 'global') {
      global.accent = 'custom'
      global.customHex = hex
    } else {
      domains[scope].accent = 'custom'
      domains[scope].customHex = hex
    }
  }

  /** The scope currently shown (preview wins, else active domain, else global). */
  function currentScope(): Scope {
    return previewScope.value ?? activeDomain.value ?? 'global'
  }

  /** Effective light/dark of whatever the user is currently looking at. */
  function effectiveMode(): Mode {
    return resolve(currentScope()).mode
  }

  /** Flip light/dark for the scope in view (accent untouched). */
  function toggleMode(): void {
    const scope = currentScope()
    const next: Mode = effectiveMode() === 'dark' ? 'light' : 'dark'
    setMode(scope, next)
  }

  // Re-apply + persist whenever anything relevant changes.
  watch([global, domains, activeDomain, previewScope], () => {
    apply()
    save()
  })

  return {
    global,
    domains,
    activeDomain,
    previewScope,
    loaded,
    choiceFor,
    resolve,
    apply,
    load,
    setMode,
    setAccent,
    setCustom,
    currentScope,
    effectiveMode,
    toggleMode
  }
})
