import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Note, UpdateNoteInput } from '@shared/types'

const OWNER = 'book'
export const MAX_NOTES = 6

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const bookId = ref<number | null>(null)
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
          ' — the main process is a version behind. Fully stop the dev server (Ctrl+C) and run "npm run dev" again.'
      }
      lastError.value = `${label} failed: ${msg}${hint}`
      console.error('[notes]', label, e)
      return undefined
    }
  }

  async function loadForBook(id: number): Promise<void> {
    bookId.value = id
    const list = await guard('Load notes', () => window.cypher.notes.list(OWNER, id))
    notes.value = list ?? []
  }

  async function add(): Promise<void> {
    if (bookId.value == null || notes.value.length >= MAX_NOTES) return
    const created = await guard('Create note', () =>
      window.cypher.notes.create(OWNER, bookId.value!)
    )
    if (created) notes.value.push(created)
  }

  async function save(id: number, patch: UpdateNoteInput): Promise<void> {
    const updated = await guard('Save note', () => window.cypher.notes.update(id, patch))
    if (updated) {
      const i = notes.value.findIndex((n) => n.id === id)
      if (i !== -1) notes.value[i] = updated
    }
  }

  async function remove(id: number): Promise<void> {
    const ok = await guard('Delete note', async () => {
      await window.cypher.notes.remove(id)
      return true
    })
    if (ok) notes.value = notes.value.filter((n) => n.id !== id)
  }

  function clearError(): void {
    lastError.value = null
  }

  return { notes, bookId, lastError, loadForBook, add, save, remove, clearError }
})
