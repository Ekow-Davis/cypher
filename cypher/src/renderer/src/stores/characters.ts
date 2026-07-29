import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Character } from '@shared/types'

const UNFILED = 'Unfiled'

export const useCharactersStore = defineStore('characters', () => {
  const characters = ref<Character[]>([])
  const activeId = ref<number | null>(null)
  const bookId = ref<number | null>(null)
  const loaded = ref(false)
  const lastError = ref<string | null>(null)

  const active = computed<Character | null>(
    () => characters.value.find((c) => c.id === activeId.value) ?? null
  )

  // Grouped by folder; Unfiled always last.
  const groups = computed(() => {
    const map = new Map<string, Character[]>()
    for (const c of characters.value) {
      const key = c.folder?.trim() || UNFILED
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return [...map.entries()]
      .sort((a, b) => {
        if (a[0] === UNFILED) return 1
        if (b[0] === UNFILED) return -1
        return a[0].localeCompare(b[0])
      })
      .map(([folder, items]) => ({ folder, items }))
  })

  const folderNames = computed(() => groups.value.map((g) => g.folder).filter((n) => n !== UNFILED))

  async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      lastError.value = null
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      let hint = ''
      if (
        /no such column|no such table|No handler registered|Cannot read propert.*undefined|is not a function/i.test(
          msg
        )
      ) {
        hint =
          ' — the main process is a version behind (stale preload or unrun migration). Fully stop the dev server (Ctrl+C) and run "npm run dev" again — a page reload is not enough.'
      }
      lastError.value = `${label} failed: ${msg}${hint}`
      console.error('[characters]', label, e)
      return undefined
    }
  }

  function clearError(): void {
    lastError.value = null
  }

  async function loadForBook(id: number): Promise<void> {
    bookId.value = id
    const list = await guard('Load characters', () => window.cypher.characters.list(id))
    characters.value = list ?? []
    activeId.value = characters.value[0]?.id ?? null
    loaded.value = true
  }

  async function add(folder: string | null = null): Promise<void> {
    if (bookId.value == null) {
      lastError.value = 'No book loaded yet — reopen the book and try again.'
      return
    }
    const created = await guard('Create character', () =>
      window.cypher.characters.create(bookId.value!, { folder })
    )
    if (!created) return
    const fresh = await guard('Load characters', () =>
      window.cypher.characters.list(bookId.value!)
    )
    if (fresh) characters.value = fresh
    activeId.value = created.id
  }

  /** Creates a character with a given name without stealing the current selection. */
  async function createNamed(name: string): Promise<Character | undefined> {
    if (bookId.value == null) {
      lastError.value = 'No book loaded yet — reopen the book and try again.'
      return undefined
    }
    const created = await guard('Create character', () =>
      window.cypher.characters.create(bookId.value!, { name })
    )
    if (!created) return undefined
    const fresh = await guard('Load characters', () =>
      window.cypher.characters.list(bookId.value!)
    )
    if (fresh) characters.value = fresh
    return created
  }

  async function rename(id: number, name: string): Promise<void> {
    const updated = await guard('Rename character', () =>
      window.cypher.characters.rename(id, name)
    )
    if (updated) replace(updated)
  }

  async function setFolder(id: number, folder: string | null): Promise<void> {
    const updated = await guard('Move character', () =>
      window.cypher.characters.setFolder(id, folder)
    )
    if (updated) replace(updated)
  }

  async function saveFields(id: number, fieldsJson: string): Promise<void> {
    const updated = await guard('Save character', () =>
      window.cypher.characters.saveFields(id, fieldsJson)
    )
    if (updated) replace(updated)
  }

  async function importImage(id: number): Promise<void> {
    const path = await guard('Import image', () => window.cypher.characters.importImage())
    if (path) {
      const updated = await guard('Set image', () =>
        window.cypher.characters.setImage(id, path)
      )
      if (updated) replace(updated)
    }
  }

  async function clearImage(id: number): Promise<void> {
    const updated = await guard('Remove image', () =>
      window.cypher.characters.setImage(id, null)
    )
    if (updated) replace(updated)
  }

  async function remove(id: number): Promise<void> {
    const ok = await guard('Delete character', async () => {
      await window.cypher.characters.remove(id)
      return true
    })
    if (!ok) return
    const wasActive = activeId.value === id
    characters.value = characters.value.filter((c) => c.id !== id)
    if (wasActive) activeId.value = characters.value[0]?.id ?? null
  }

  function setActive(id: number): void {
    activeId.value = id
  }

  function replace(updated: Character): void {
    const i = characters.value.findIndex((c) => c.id === updated.id)
    if (i !== -1) characters.value[i] = updated
  }

  return {
    characters,
    activeId,
    active,
    bookId,
    loaded,
    lastError,
    groups,
    folderNames,
    loadForBook,
    add,
    createNamed,
    rename,
    setFolder,
    saveFields,
    importImage,
    clearImage,
    remove,
    setActive,
    clearError
  }
})
