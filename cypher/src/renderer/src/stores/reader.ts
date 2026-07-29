import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ReaderItem, ReaderImportResult } from '@shared/types'

export const useReaderStore = defineStore('reader', () => {
  const items = ref<ReaderItem[]>([])
  const loaded = ref(false)
  const lastError = ref<string | null>(null)

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
      console.error('[reader]', label, e)
      return undefined
    }
  }

  function clearError(): void {
    lastError.value = null
  }

  async function load(): Promise<void> {
    const list = await guard('Load library', () => window.cypher.reader.list())
    items.value = list ?? []
    loaded.value = true
  }

  /** Opens the picker, copies the file in, returns the item + original path (for the delete prompt). */
  async function importFile(): Promise<ReaderImportResult | null> {
    const res = await guard('Import book', () => window.cypher.reader.import())
    if (!res) return null
    items.value.unshift(res.item)
    return res
  }

  async function deleteSource(path: string): Promise<boolean> {
    return (await guard('Delete original', () => window.cypher.reader.deleteSource(path))) ?? false
  }

  async function rename(id: number, title: string): Promise<void> {
    const u = await guard('Rename', () => window.cypher.reader.rename(id, title))
    if (u) replace(u)
  }

  async function setAuthor(id: number, author: string | null): Promise<void> {
    const u = await guard('Update author', () => window.cypher.reader.setAuthor(id, author))
    if (u) replace(u)
  }

  async function importCover(id: number): Promise<void> {
    const u = await guard('Set cover', () => window.cypher.reader.importCover(id))
    if (u) replace(u)
  }

  async function setLocation(id: number, location: string | null): Promise<void> {
    const u = await guard('Save position', () => window.cypher.reader.setLocation(id, location))
    if (u) replace(u)
  }

  async function remove(id: number): Promise<void> {
    const ok = await guard('Delete book', () => window.cypher.reader.remove(id))
    if (ok) items.value = items.value.filter((i) => i.id !== id)
  }

  function getById(id: number): ReaderItem | null {
    return items.value.find((i) => i.id === id) ?? null
  }

  function replace(updated: ReaderItem): void {
    const i = items.value.findIndex((x) => x.id === updated.id)
    if (i !== -1) items.value[i] = updated
  }

  return {
    items,
    loaded,
    lastError,
    load,
    importFile,
    deleteSource,
    rename,
    setAuthor,
    importCover,
    setLocation,
    remove,
    getById,
    clearError
  }
})
