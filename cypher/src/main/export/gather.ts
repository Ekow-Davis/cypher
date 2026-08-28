import { getBook } from '../db/repositories/books'
import { listVolumes } from '../db/repositories/volumes'
import { numberChapters, type NumberingStyle } from '@shared/numbering'
import { listChapters } from '../db/repositories/chapters'
import type { Book, Chapter } from '@shared/types'

export interface ExportGroup {
  volumeTitle: string | null
  chapters: Chapter[]
}
export interface ExportBook {
  book: Book
  groups: ExportGroup[]
  chapters: Chapter[]
}

/**
 * Collects a book in reading order: each volume with its chapters, then any
 * unsorted chapters last — mirroring how the manuscript sidebar presents it.
 */
export function gatherBook(bookId: number, chapterIds?: number[]): ExportBook | null {
  const book = getBook(bookId)
  if (!book) return null
  const volumes = listVolumes(bookId)
  const keep = chapterIds && chapterIds.length ? new Set(chapterIds) : null
  const everyChapter = listChapters(bookId)

  /**
   * Numbering is computed against the *whole* book, then applied to whatever
   * subset is being exported — so exporting only chapters 10-12 still calls
   * them 10, 11 and 12 rather than renumbering them from one.
   */
  const style = ((book as { numbering_style?: string }).numbering_style ??
    'off') as NumberingStyle
  const titles = new Map(
    numberChapters(
      everyChapter.map((c) => ({
        id: c.id,
        title: c.title,
        volume_id: c.volume_id,
        sort_order: c.sort_order
      })),
      volumes.map((v) => ({
        id: v.id,
        numbered: (v as { numbered?: number }).numbered ?? 1,
        unnumbered_label: (v as { unnumbered_label?: string }).unnumbered_label ?? ''
      })),
      style
    ).map((n) => [n.id, n.displayTitle])
  )

  const all = everyChapter
    .filter((c) => !keep || keep.has(c.id))
    .map((c) => ({ ...c, title: titles.get(c.id) ?? c.title }))
  const byOrder = (a: Chapter, b: Chapter): number => a.sort_order - b.sort_order || a.id - b.id

  // Volumes with no surviving chapters are dropped, so a filtered export
  // doesn't emit empty part headings.
  const groups: ExportGroup[] = volumes
    .map((v) => ({
      volumeTitle: v.title,
      chapters: all.filter((c) => c.volume_id === v.id).sort(byOrder)
    }))
    .filter((g) => g.chapters.length > 0)
  const unsorted = all.filter((c) => c.volume_id == null).sort(byOrder)
  if (unsorted.length) groups.push({ volumeTitle: null, chapters: unsorted })

  return { book, groups, chapters: groups.flatMap((g) => g.chapters) }
}
