import { useChaptersStore } from '@/stores/chapters'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import { useNotesStore } from '@/stores/notes'
import { useInsightsStore } from '@/stores/insights'
import { useBooksStore } from '@/stores/books'
import { useReaderStore } from '@/stores/reader'

/**
 * Keeps windows in step. Main broadcasts which slice of data changed; this
 * re-reads only the affected stores, debounced so a burst of edits in another
 * window turns into one refresh rather than dozens.
 */
export function installSync(): void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  async function apply(scope: string): Promise<void> {
    const chapters = useChaptersStore()
    const lore = useLoreStore()
    const characters = useCharactersStore()
    const notes = useNotesStore()
    const insights = useInsightsStore()
    const books = useBooksStore()
    const reader = useReaderStore()

    try {
      switch (scope) {
        case 'chapters':
        case 'volumes':
          await chapters.refresh()
          break
        case 'lore':
          await lore.refresh()
          break
        case 'characters':
          await characters.refresh()
          // POV pickers and mention labels read from the cast
          break
        case 'notes':
          await notes.refresh()
          break
        case 'goals':
        case 'checkins':
          if (insights.bookId != null) await insights.loadForBook(insights.bookId)
          break
        case 'books':
          await books.load()
          break
        case 'reader':
          await reader.load()
          break
        case 'trash':
          // A restore or purge can touch anything, so re-read what's loaded.
          await Promise.all([
            chapters.refresh(),
            lore.refresh(),
            characters.refresh(),
            books.load()
          ])
          break
        default:
          break
      }
    } catch (e) {
      console.warn('[sync] refresh failed for', scope, e)
    }
  }

  window.cypher.onDataChanged((scope: string) => {
    const pending = timers.get(scope)
    if (pending) clearTimeout(pending)
    timers.set(
      scope,
      setTimeout(() => {
        timers.delete(scope)
        void apply(scope)
      }, 350)
    )
  })
}
