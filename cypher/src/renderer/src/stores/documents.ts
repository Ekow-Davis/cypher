import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Doc, UpdateDocMetaInput } from '@shared/types'

export const useDocumentsStore = defineStore('documents', () => {
  const docs = ref<Doc[]>([])
  const loaded = ref(false)
  /** The document open in this window, if any — sync skips its content. */
  const openId = ref<number | null>(null)
  const lastError = ref<string | null>(null)

  async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      lastError.value = null
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      let hint = ''
      if (/No handler registered|Cannot read propert.*undefined|is not a function/i.test(msg)) {
        hint =
          ' — the main process is a version behind. Fully stop the dev server (Ctrl+C) and run "npm run dev" again.'
      }
      lastError.value = `${label} failed: ${msg}${hint}`
      console.error('[docs]', label, e)
      return undefined
    }
  }

  async function load(): Promise<void> {
    const list = await guard('Load documents', () => window.cypher.docs.list())
    docs.value = list ?? []
    loaded.value = true
  }

  /**
   * Re-reads the list after another window changed something. Objects are
   * updated in place so open views keep their references, and the `content` of
   * a document being edited elsewhere in THIS window is left alone.
   */
  async function refresh(openId?: number | null): Promise<void> {
    const fresh = await guard('Load documents', () => window.cypher.docs.list())
    if (!fresh) return
    const byId = new Map(docs.value.map((d) => [d.id, d]))
    docs.value = fresh.map((incoming) => {
      const existing = byId.get(incoming.id)
      if (!existing) return incoming
      const patch =
        openId != null && existing.id === openId
          ? { ...incoming, content: existing.content }
          : incoming
      Object.assign(existing, patch)
      return existing
    })
  }

  async function create(): Promise<Doc | undefined> {
    const created = await guard('Create document', () => window.cypher.docs.create())
    if (created) docs.value.unshift(created)
    return created
  }

  async function rename(id: number, title: string): Promise<void> {
    const updated = await guard('Rename', () => window.cypher.docs.rename(id, title))
    if (updated) replace(updated)
  }

  async function saveContent(id: number, content: string): Promise<void> {
    const updated = await guard('Save', () => window.cypher.docs.saveContent(id, content))
    if (updated) replace(updated)
  }

  async function saveMeta(id: number, patch: UpdateDocMetaInput): Promise<void> {
    const updated = await guard('Save', () => window.cypher.docs.saveMeta(id, patch))
    if (updated) replace(updated)
  }

  async function duplicate(id: number): Promise<void> {
    const copy = await guard('Duplicate', () => window.cypher.docs.duplicate(id))
    if (copy) docs.value.unshift(copy)
  }

  async function remove(id: number): Promise<void> {
    const ok = await guard('Delete', async () => {
      await window.cypher.docs.remove(id)
      return true
    })
    if (ok) docs.value = docs.value.filter((d) => d.id !== id)
  }

  function getById(id: number): Doc | null {
    return docs.value.find((d) => d.id === id) ?? null
  }

  function replace(updated: Doc): void {
    const existing = docs.value.find((d) => d.id === updated.id)
    if (existing) Object.assign(existing, updated)
  }

  function clearError(): void {
    lastError.value = null
  }

  return {
    docs,
    loaded,
    openId,
    lastError,
    load,
    refresh,
    create,
    rename,
    saveContent,
    saveMeta,
    duplicate,
    remove,
    getById,
    clearError
  }
})
