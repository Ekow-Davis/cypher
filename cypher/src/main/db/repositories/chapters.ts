import { getDb } from '../index'
import type {
  Chapter,
  ChapterPlacement,
  CreateChapterOptions,
  UpdateChapterMetaInput, SplitChapterInput } from '@shared/types'

/** Chapters repository. */

export function listChapters(bookId: number): Chapter[] {
  return getDb()
    .prepare('SELECT * FROM chapters WHERE book_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC')
    .all(bookId) as Chapter[]
}

export function getChapter(id: number): Chapter | null {
  return (getDb().prepare('SELECT * FROM chapters WHERE id = ?').get(id) as Chapter) ?? null
}

export function createChapter(bookId: number, opts?: CreateChapterOptions): Chapter {
  const db = getDb()
  const volumeId = opts?.volumeId ?? null
  const bookCount = (
    db
      .prepare('SELECT COUNT(*) AS c FROM chapters WHERE book_id = ? AND deleted_at IS NULL')
      .get(bookId) as { c: number }
  ).c
  // append within the target group (volume or unsorted)
  const maxOrder = (
    db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE book_id = ? AND volume_id IS ? AND deleted_at IS NULL'
      )
      .get(bookId, volumeId) as { m: number }
  ).m
  const finalTitle = opts?.title?.trim() || `Chapter ${bookCount + 1}`
  const info = db
    .prepare('INSERT INTO chapters (book_id, volume_id, title, sort_order) VALUES (?, ?, ?, ?)')
    .run(bookId, volumeId, finalTitle, maxOrder + 1)
  return getChapter(Number(info.lastInsertRowid)) as Chapter
}

/** Returns the book's chapters, creating "Chapter 1" (unsorted) if there are none. */
export function ensureFirstChapter(bookId: number): Chapter[] {
  const list = listChapters(bookId)
  if (list.length > 0) return list
  createChapter(bookId)
  return listChapters(bookId)
}

export function renameChapter(id: number, title: string): Chapter | null {
  getDb().prepare('UPDATE chapters SET title = ? WHERE id = ?').run(title.trim() || 'Untitled', id)
  return getChapter(id)
}

export function saveChapterContent(id: number, content: string, wordCount: number): Chapter | null {
  getDb()
    .prepare(
      "UPDATE chapters SET content = ?, word_count = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(content, wordCount, id)
  return getChapter(id)
}

const META_FIELDS = ['synopsis', 'status', 'pov_character_id'] as const

/** Updates chapter metadata. Only whitelisted columns can be written. */
export function updateChapterMeta(id: number, patch: UpdateChapterMetaInput): Chapter | null {
  const entries = Object.entries(patch).filter(([k]) =>
    (META_FIELDS as readonly string[]).includes(k)
  )
  if (entries.length === 0) return getChapter(id)
  const sets = entries.map(([k]) => `${k} = ?`).join(', ')
  const values = entries.map(([, v]) => v as string | number | null)
  getDb()
    .prepare(`UPDATE chapters SET ${sets} WHERE id = ?`)
    .run(...values, id)
  return getChapter(id)
}

/** Persists a full re-placement: volume assignment + order, in one transaction. */
export function applyChapterOrder(items: ChapterPlacement[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE chapters SET volume_id = ?, sort_order = ? WHERE id = ?')
  const tx = db.transaction((list: ChapterPlacement[]) => {
    for (const it of list) stmt.run(it.volumeId, it.sortOrder, it.id)
  })
  tx(items)
}

/** Soft delete — the chapter moves to the trash and can be restored. */
/**
 * Splits a chapter in two, placing the new one immediately after the original.
 *
 * Everything after the original's position is shifted down first, so the new
 * chapter lands in the right slot instead of at the end of the book — the
 * whole point of splitting is that the halves stay adjacent. Both writes run
 * in one transaction so a failure can't leave the manuscript half-split.
 */
export function splitChapter(input: SplitChapterInput): Chapter[] | null {
  const db = getDb()
  const original = getChapter(input.id)
  if (!original) return null

  const run = db.transaction(() => {
    db.prepare(
      "UPDATE chapters SET content = ?, word_count = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(input.firstContent, input.firstWordCount, input.id)

    // Make room directly below the original.
    db.prepare(
      'UPDATE chapters SET sort_order = sort_order + 1 WHERE book_id = ? AND sort_order > ?'
    ).run(original.book_id, original.sort_order)

    db.prepare(
      `INSERT INTO chapters (book_id, volume_id, title, content, word_count, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      original.book_id,
      original.volume_id,
      input.secondTitle.trim() || 'Untitled chapter',
      input.secondContent,
      input.secondWordCount,
      original.sort_order + 1
    )
  })

  run()
  return listChapters(original.book_id)
}

export interface ImportedChapterInput {
  title: string
  content: string
  wordCount: number
}

/**
 * Appends imported chapters to a book in one transaction.
 *
 * All-or-nothing on purpose: a partial import would leave the writer manually
 * deleting half a manuscript to try again.
 */
export function importChapters(
  bookId: number,
  items: ImportedChapterInput[],
  volumeId: number | null = null
): Chapter[] {
  const db = getDb()
  const start = (
    db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE book_id = ?')
      .get(bookId) as { m: number }
  ).m

  const insert = db.prepare(
    `INSERT INTO chapters (book_id, volume_id, title, content, word_count, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const run = db.transaction(() => {
    items.forEach((item, i) => {
      insert.run(
        bookId,
        volumeId,
        item.title.trim() || `Chapter ${i + 1}`,
        item.content,
        item.wordCount,
        start + 1 + i
      )
    })
  })
  run()
  return listChapters(bookId)
}

export function deleteChapter(id: number): void {
  getDb().prepare("UPDATE chapters SET deleted_at = datetime('now') WHERE id = ?").run(id)
}
