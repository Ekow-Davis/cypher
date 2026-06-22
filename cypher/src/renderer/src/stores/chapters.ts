import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Chapter } from '@shared/types'

export const useChaptersStore = defineStore('chapters', () => {
  const chapters = ref<Chapter[]>([])
  const activeId = ref<number | null>(null)
  const bookId = ref<number | null>(null)

  const active = computed<Chapter | null>(
    () => chapters.value.find((c) => c.id === activeId.value) ?? null
  )

  async function loadForBook(id: number): Promise<void> {
    bookId.value = id
    chapters.value = await window.cypher.chapters.ensureFirst(id)
    activeId.value = chapters.value[0]?.id ?? null
  }

  async function add(): Promise<void> {
    if (bookId.value == null) return
    const chapter = await window.cypher.chapters.create(bookId.value)
    chapters.value.push(chapter)
    activeId.value = chapter.id
  }

  async function rename(id: number, title: string): Promise<void> {
    const updated = await window.cypher.chapters.rename(id, title)
    if (updated) replace(updated)
  }

  async function saveContent(id: number, content: string, wordCount: number): Promise<void> {
    const updated = await window.cypher.chapters.saveContent(id, content, wordCount)
    if (updated) replace(updated)
  }

  async function remove(id: number): Promise<void> {
    await window.cypher.chapters.remove(id)
    const wasActive = activeId.value === id
    chapters.value = chapters.value.filter((c) => c.id !== id)
    if (wasActive) activeId.value = chapters.value[0]?.id ?? null
  }

  function setActive(id: number): void {
    activeId.value = id
  }

  function replace(updated: Chapter): void {
    const i = chapters.value.findIndex((c) => c.id === updated.id)
    if (i !== -1) chapters.value[i] = updated
  }

  return { chapters, activeId, active, bookId, loadForBook, add, rename, saveContent, remove, setActive }
})
