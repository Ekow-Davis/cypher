import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LoreEntry } from '@shared/types'

export const useLoreStore = defineStore('lore', () => {
  const entries = ref<LoreEntry[]>([])
  const activeId = ref<number | null>(null)
  const bookId = ref<number | null>(null)
  const loaded = ref(false)
  const lastError = ref<string | null>(null)

  const active = computed<LoreEntry | null>(
    () => entries.value.find((e) => e.id === activeId.value) ?? null
  )

  const groups = computed(() => {
    const map = new Map<string, LoreEntry[]>()
    for (const e of entries.value) {
      if (!map.has(e.category)) map.set(e.category, [])
      map.get(e.category)!.push(e)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, items]) => ({ category, items }))
  })

  const categoryNames = computed(() => groups.value.map((g) => g.category))

  // Surfaces IPC failures instead of swallowing them.
  async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      lastError.value = null
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError.value = `${label} failed: ${msg}`
      console.error('[lore]', label, e)
      return undefined
    }
  }

  function clearError(): void {
    lastError.value = null
  }

  async function loadForBook(id: number): Promise<void> {
    bookId.value = id
    const list = await guard('Load lore', () => window.cypher.lore.list(id))
    entries.value = list ?? []
    activeId.value = entries.value[0]?.id ?? null
    loaded.value = true
  }

  async function add(category = 'General'): Promise<void> {
    if (bookId.value == null) {
      lastError.value = 'No book loaded yet — reopen the book and try again.'
      return
    }
    const entry = await guard('Create entry', () =>
      window.cypher.lore.create(bookId.value!, { category })
    )
    if (entry) {
      entries.value.push(entry)
      activeId.value = entry.id
    }
  }

  async function rename(id: number, title: string): Promise<void> {
    const updated = await guard('Rename entry', () => window.cypher.lore.rename(id, title))
    if (updated) replace(updated)
  }

  async function setCategory(id: number, category: string): Promise<void> {
    const updated = await guard('Change category', () =>
      window.cypher.lore.setCategory(id, category)
    )
    if (updated) replace(updated)
  }

  async function saveContent(id: number, content: string): Promise<void> {
    const updated = await guard('Save entry', () => window.cypher.lore.saveContent(id, content))
    if (updated) replace(updated)
  }

  async function remove(id: number): Promise<void> {
    const ok = await guard('Delete entry', async () => {
      await window.cypher.lore.remove(id)
      return true
    })
    if (!ok) return
    const wasActive = activeId.value === id
    entries.value = entries.value.filter((e) => e.id !== id)
    if (wasActive) activeId.value = entries.value[0]?.id ?? null
  }

  function setActive(id: number): void {
    activeId.value = id
  }

  function replace(updated: LoreEntry): void {
    const i = entries.value.findIndex((e) => e.id === updated.id)
    if (i !== -1) entries.value[i] = updated
  }

  return {
    entries,
    activeId,
    active,
    bookId,
    loaded,
    lastError,
    groups,
    categoryNames,
    loadForBook,
    add,
    rename,
    setCategory,
    saveContent,
    remove,
    setActive,
    clearError
  }
})
