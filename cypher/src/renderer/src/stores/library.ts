import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LibraryLoreEntry, LoreEntry } from '@shared/types'
import { useLoreStore } from './lore'
import { useCharactersStore } from './characters'
import { buildRefIndex, looseKey } from '@/lib/mentionRefs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * References inside library entries can't point at any one book's ids, so
 * they are stored unlinked (id -1) with their name kept. When an entry is
 * copied into a book, each reference is reconnected by name to that book's
 * own entries and characters; ones with no match stay unlinked and reconnect
 * by themselves if a same-named entry is added later.
 */
export function detachMentions(content: string): string {
  if (!content || !content.includes('"mention"')) return content
  try {
    const walk = (n: any): any => {
      if (n?.type === 'mention') return { ...n, attrs: { ...n.attrs, id: -1 } }
      return Array.isArray(n?.content) ? { ...n, content: n.content.map(walk) } : n
    }
    return JSON.stringify(walk(JSON.parse(content)))
  } catch {
    return content
  }
}

export function attachMentions(content: string, index: ReturnType<typeof buildRefIndex>): string {
  if (!content || !content.includes('"mention"')) return content
  try {
    const walk = (n: any): any => {
      if (n?.type === 'mention') {
        const hit = index.get(looseKey(String(n.attrs?.label ?? '')))
        const kind = n.attrs?.kind === 'lore' ? 'lore' : 'character'
        if (hit && hit.kind === kind) return { ...n, attrs: { ...n.attrs, id: hit.id, label: hit.label } }
        return { ...n, attrs: { ...n.attrs, id: -1 } }
      }
      return Array.isArray(n?.content) ? { ...n, content: n.content.map(walk) } : n
    }
    return JSON.stringify(walk(JSON.parse(content)))
  } catch {
    return content
  }
}

export type LinkState = 'none' | 'same' | 'differs' | 'missing'

export const useLibraryStore = defineStore('library', () => {
  const entries = ref<LibraryLoreEntry[]>([])
  const loaded = ref(false)

  async function load(): Promise<void> {
    try {
      entries.value = await window.cypher.library.list()
    } catch {
      entries.value = []
    }
    loaded.value = true
  }

  /** How a book entry compares with its library copy. */
  function stateOf(entry: LoreEntry): LinkState {
    if (!entry.library_id) return 'none'
    const lib = entries.value.find((e) => e.id === entry.library_id)
    if (!lib) return 'missing'
    const same =
      lib.title === entry.title &&
      lib.category === entry.category &&
      lib.content === detachMentions(entry.content)
    return same ? 'same' : 'differs'
  }

  /** Sends book entries to the library, creating or updating their copies. */
  async function push(list: LoreEntry[]): Promise<number> {
    const lore = useLoreStore()
    let n = 0
    for (const entry of list) {
      const saved = await window.cypher.library.push(entry.id, detachMentions(entry.content))
      if (saved) {
        n++
        const local = lore.entries.find((e) => e.id === entry.id)
        if (local) local.library_id = saved.id
      }
    }
    await load()
    return n
  }

  /**
   * Copies library entries into the open book. An entry already linked to
   * one in this book updates that one instead of adding a duplicate.
   */
  async function importInto(
    bookId: number,
    ids: number[],
    category: string | null
  ): Promise<{ created: number; updated: number; firstId: number | null }> {
    const lore = useLoreStore()
    const characters = useCharactersStore()
    const chosen = entries.value.filter((e) => ids.includes(e.id))
    const plan: { loreId: number; lib: LibraryLoreEntry; isNew: boolean }[] = []

    for (const lib of chosen) {
      const existing = lore.entries.find((e) => e.library_id === lib.id)
      if (existing) {
        plan.push({ loreId: existing.id, lib, isNew: false })
        continue
      }
      const created = await window.cypher.lore.create(bookId, {
        title: lib.title,
        category: category ?? lib.category
      })
      await window.cypher.library.link(created.id, lib.id)
      plan.push({ loreId: created.id, lib, isNew: true })
    }
    await lore.refresh()

    // Every title exists now, so references between imported entries resolve.
    const index = buildRefIndex(lore.entries, characters.characters)
    for (const step of plan) {
      await lore.saveContent(step.loreId, attachMentions(step.lib.content, index))
      if (!step.isNew) lore.noteExternalEdit(step.loreId)
      if (!step.isNew) {
        const local = lore.entries.find((e) => e.id === step.loreId)
        if (local && local.title !== step.lib.title) await lore.rename(step.loreId, step.lib.title)
        if (local && !category && local.category !== step.lib.category)
          await lore.setCategory(step.loreId, step.lib.category)
      }
    }
    await lore.refresh()
    return {
      created: plan.filter((p) => p.isNew).length,
      updated: plan.filter((p) => !p.isNew).length,
      firstId: plan[0]?.loreId ?? null
    }
  }

  async function rename(id: number, title: string, category: string): Promise<void> {
    const saved = await window.cypher.library.rename(id, title, category)
    if (saved) {
      const i = entries.value.findIndex((e) => e.id === id)
      if (i !== -1) entries.value.splice(i, 1, saved)
    }
  }

  async function remove(id: number): Promise<void> {
    await window.cypher.library.remove(id)
    entries.value = entries.value.filter((e) => e.id !== id)
    for (const e of useLoreStore().entries) if (e.library_id === id) e.library_id = null
  }

  return { entries, loaded, load, stateOf, push, importInto, rename, remove }
})
