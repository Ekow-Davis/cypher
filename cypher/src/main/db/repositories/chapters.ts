import { getDb } from '../index'
import type { Chapter, ChapterPlacement, CreateChapterOptions } from '@shared/types'

/** Chapters repository. */

export function listChapters(bookId: number): Chapter[] {
  return getDb()
    .prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY sort_order ASC, id ASC')
    .all(bookId) as Chapter[]
}

export function getChapter(id: number): Chapter | null {
  return (getDb().prepare('SELECT * FROM chapters WHERE id = ?').get(id) as Chapter) ?? null
}

export function createChapter(bookId: number, opts?: CreateChapterOptions): Chapter {
  const db = getDb()
  const volumeId = opts?.volumeId ?? null
  const bookCount = (
    db.prepare('SELECT COUNT(*) AS c FROM chapters WHERE book_id = ?').get(bookId) as { c: number }
  ).c
  // append within the target group (volume or unsorted)
  const maxOrder = (
    db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE book_id = ? AND volume_id IS ?'
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

/** Persists a full re-placement: volume assignment + order, in one transaction. */
export function applyChapterOrder(items: ChapterPlacement[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE chapters SET volume_id = ?, sort_order = ? WHERE id = ?')
  const tx = db.transaction((list: ChapterPlacement[]) => {
    for (const it of list) stmt.run(it.volumeId, it.sortOrder, it.id)
  })
  tx(items)
}

export function deleteChapter(id: number): void {
  getDb().prepare('DELETE FROM chapters WHERE id = ?').run(id)
}
