import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReaderMark, CreateMarkInput, UpdateMarkInput } from '@shared/types'

export const HIGHLIGHT_COLORS = ['amber', 'rose', 'emerald', 'sky', 'violet'] as const
export const COLOR_HEX: Record<string, string> = {
  amber: '#f59e0b',
  rose: '#f43f5e',
  emerald: '#10b981',
  sky: '#0ea5e9',
  violet: '#8b5cf6'
}

export const useMarksStore = defineStore('marks', () => {
  const marks = ref<ReaderMark[]>([])
  const itemId = ref<number | null>(null)

  const bookmarks = computed(() => marks.value.filter((m) => m.kind === 'bookmark'))
  const highlights = computed(() => marks.value.filter((m) => m.kind === 'highlight'))

  async function loadFor(id: number): Promise<void> {
    itemId.value = id
    try {
      marks.value = await window.cypher.marks.list(id)
    } catch (e) {
      console.warn('[marks] load failed', e)
      marks.value = []
    }
  }

  async function add(input: Omit<CreateMarkInput, 'itemId'>): Promise<ReaderMark | null> {
    if (itemId.value == null) return null
    try {
      const created = await window.cypher.marks.create({ ...input, itemId: itemId.value })
      marks.value.push(created)
      return created
    } catch (e) {
      console.warn('[marks] create failed', e)
      return null
    }
  }

  async function update(id: number, patch: UpdateMarkInput): Promise<void> {
    try {
      const updated = await window.cypher.marks.update(id, patch)
      if (updated) {
        const existing = marks.value.find((m) => m.id === id)
        if (existing) Object.assign(existing, updated)
      }
    } catch (e) {
      console.warn('[marks] update failed', e)
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      await window.cypher.marks.remove(id)
      marks.value = marks.value.filter((m) => m.id !== id)
    } catch (e) {
      console.warn('[marks] delete failed', e)
    }
  }

  return { marks, itemId, bookmarks, highlights, loadFor, add, update, remove }
})
