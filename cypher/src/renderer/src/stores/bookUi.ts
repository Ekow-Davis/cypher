import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCharactersStore } from './characters'
import { useLoreStore } from './lore'
import { useChaptersStore } from './chapters'

export type BookTab = 'manuscript' | 'lore' | 'characters' | 'timeline'

/**
 * Cross-tab UI state for the book workspace. Lives in a store (rather than
 * local component state) so a character mention clicked inside the manuscript
 * or a lore entry can switch tabs and focus that character.
 */
export const useBookUiStore = defineStore('bookUi', () => {
  const tab = ref<BookTab>('manuscript')

  /**
   * What the editor should highlight and scroll to.
   *
   * The sidebar and the editor are siblings, so the jump is coordinated
   * through here rather than by reaching into one another: the sidebar sets a
   * target, the editor watches for it. `nonce` forces a reaction even when the
   * same hit is clicked twice, which is what makes re-clicking scroll back.
   */
  const searchTarget = ref<{
    chapterId: number
    query: string
    hitIndex: number
    nonce: number
  } | null>(null)

  function jumpToHit(chapterId: number, query: string, hitIndex: number): void {
    searchTarget.value = { chapterId, query, hitIndex, nonce: Date.now() }
  }

  function clearSearchTarget(): void {
    searchTarget.value = null
  }

  /**
   * A pending replace for the editor to carry out.
   *
   * Replacement runs inside the editor rather than against stored JSON so it
   * goes through the normal edit pipeline — undoable in one step, and picked up
   * by autosave like any other change.
   */
  const replaceRequest = ref<{
    chapterId: number
    query: string
    replacement: string
    /** null replaces every match in the chapter. */
    hitIndex: number | null
    nonce: number
  } | null>(null)

  function requestReplace(
    chapterId: number,
    query: string,
    replacement: string,
    hitIndex: number | null
  ): void {
    replaceRequest.value = { chapterId, query, replacement, hitIndex, nonce: Date.now() }
  }

  function setTab(next: BookTab): void {
    tab.value = next
  }

  function openCharacter(id: number): void {
    const characters = useCharactersStore()
    characters.setActive(id)
    tab.value = 'characters'
  }

  /**
   * A mention for the chapter editor to scroll to once the chapter is open —
   * what a backlink click asks for.
   */
  const mentionTarget = ref<{
    chapterId: number
    kind: 'character' | 'lore'
    id: number
    nonce: number
  } | null>(null)

  function openChapterAtMention(chapterId: number, kind: 'character' | 'lore', id: number): void {
    const chapters = useChaptersStore()
    chapters.setActive(chapterId)
    tab.value = 'manuscript'
    mentionTarget.value = { chapterId, kind, id, nonce: Date.now() }
  }

  function openLore(id: number): void {
    const lore = useLoreStore()
    if (!lore.entries.some((e) => e.id === id)) return
    lore.setActive(id)
    tab.value = 'lore'
  }

  return {
    tab,
    setTab,
    openCharacter,
    openLore,
    mentionTarget,
    openChapterAtMention,
    searchTarget,
    jumpToHit,
    clearSearchTarget,
    replaceRequest,
    requestReplace
  }
})
