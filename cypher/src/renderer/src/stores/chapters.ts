import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Chapter, Volume, ChapterPlacement } from '@shared/types'

export const useChaptersStore = defineStore('chapters', () => {
  const chapters = ref<Chapter[]>([])
  const volumes = ref<Volume[]>([])
  const activeId = ref<number | null>(null)
  const bookId = ref<number | null>(null)

  const active = computed<Chapter | null>(
    () => chapters.value.find((c) => c.id === activeId.value) ?? null
  )

  async function loadForBook(id: number): Promise<void> {
    bookId.value = id
    const [vols, chs] = await Promise.all([
      window.cypher.volumes.list(id),
      window.cypher.chapters.ensureFirst(id)
    ])
    volumes.value = vols
    chapters.value = chs
    activeId.value = chs[0]?.id ?? null
  }

  // ----- chapters -----
  async function add(volumeId: number | null = null): Promise<void> {
    if (bookId.value == null) return
    const chapter = await window.cypher.chapters.create(bookId.value, { volumeId })
    chapters.value.push(chapter)
    activeId.value = chapter.id
  }

  async function rename(id: number, title: string): Promise<void> {
    const updated = await window.cypher.chapters.rename(id, title)
    if (updated) replaceChapter(updated)
  }

  async function saveContent(id: number, content: string, wordCount: number): Promise<void> {
    const updated = await window.cypher.chapters.saveContent(id, content, wordCount)
    if (updated) replaceChapter(updated)
  }

  async function remove(id: number): Promise<void> {
    await window.cypher.chapters.remove(id)
    const wasActive = activeId.value === id
    chapters.value = chapters.value.filter((c) => c.id !== id)
    if (wasActive) activeId.value = chapters.value[0]?.id ?? null
  }

  async function applyOrder(placements: ChapterPlacement[]): Promise<void> {
    await window.cypher.chapters.applyOrder(placements)
    for (const p of placements) {
      const c = chapters.value.find((x) => x.id === p.id)
      if (c) {
        c.volume_id = p.volumeId
        c.sort_order = p.sortOrder
      }
    }
  }

  function setActive(id: number): void {
    activeId.value = id
  }

  function replaceChapter(updated: Chapter): void {
    const i = chapters.value.findIndex((c) => c.id === updated.id)
    if (i !== -1) chapters.value[i] = updated
  }

  // ----- volumes -----
  async function addVolume(): Promise<void> {
    if (bookId.value == null) return
    const volume = await window.cypher.volumes.create(bookId.value)
    volumes.value.push(volume)
  }

  async function renameVolume(id: number, title: string): Promise<void> {
    const updated = await window.cypher.volumes.rename(id, title)
    if (updated) {
      const i = volumes.value.findIndex((v) => v.id === id)
      if (i !== -1) volumes.value[i] = updated
    }
  }

  async function deleteVolume(id: number): Promise<void> {
    await window.cypher.volumes.remove(id)
    volumes.value = volumes.value.filter((v) => v.id !== id)
    // chapters in that volume become unsorted
    chapters.value.forEach((c) => {
      if (c.volume_id === id) c.volume_id = null
    })
  }

  async function moveVolume(id: number, direction: -1 | 1): Promise<void> {
    const i = volumes.value.findIndex((v) => v.id === id)
    const j = i + direction
    if (i === -1 || j < 0 || j >= volumes.value.length) return
    const next = volumes.value.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    volumes.value = next
    await window.cypher.volumes.reorder(next.map((v) => v.id))
  }

  return {
    chapters,
    volumes,
    activeId,
    active,
    bookId,
    loadForBook,
    add,
    rename,
    saveContent,
    remove,
    applyOrder,
    setActive,
    addVolume,
    renameVolume,
    deleteVolume,
    moveVolume
  }
})
