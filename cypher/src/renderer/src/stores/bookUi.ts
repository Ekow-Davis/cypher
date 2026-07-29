import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCharactersStore } from './characters'

export type BookTab = 'manuscript' | 'lore' | 'characters'

/**
 * Cross-tab UI state for the book workspace. Lives in a store (rather than
 * local component state) so a character mention clicked inside the manuscript
 * or a lore entry can switch tabs and focus that character.
 */
export const useBookUiStore = defineStore('bookUi', () => {
  const tab = ref<BookTab>('manuscript')

  function setTab(next: BookTab): void {
    tab.value = next
  }

  function openCharacter(id: number): void {
    const characters = useCharactersStore()
    characters.setActive(id)
    tab.value = 'characters'
  }

  return { tab, setTab, openCharacter }
})
