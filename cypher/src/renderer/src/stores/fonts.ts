import { defineStore } from 'pinia'
import { ref } from 'vue'
import { assetUrl } from '@/lib/assets'

export interface LibraryFont {
  id: string
  family: string
  fileName: string
  path: string
  format: string
}

const LIBRARY_STYLE_ID = 'cypher-font-library'

/**
 * User-added fonts, available anywhere in the app.
 *
 * The @font-face rules are injected once here rather than per component, so a
 * font added in one place is immediately usable everywhere without each editor
 * needing to know how fonts are loaded.
 */
export const useFontsStore = defineStore('fonts', () => {
  const library = ref<LibraryFont[]>([])
  const loaded = ref(false)

  function injectFaces(): void {
    let style = document.getElementById(LIBRARY_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = LIBRARY_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = library.value
      .map(
        (f) => `@font-face {
  font-family: '${f.family}';
  src: url('${assetUrl(f.path)}') format('${f.format}');
  font-display: swap;
}`
      )
      .join('\n')
  }

  async function load(): Promise<void> {
    try {
      library.value = await window.cypher.fonts.list()
    } catch {
      library.value = []
    }
    injectFaces()
    loaded.value = true
  }

  async function add(): Promise<boolean> {
    try {
      const added = await window.cypher.fonts.add()
      await load()
      return !!added
    } catch {
      return false
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await window.cypher.fonts.remove(id)
    } finally {
      await load()
    }
  }

  async function rename(id: string, family: string): Promise<void> {
    try {
      await window.cypher.fonts.rename(id, family)
    } finally {
      await load()
    }
  }

  return { library, loaded, load, add, remove, rename }
})
