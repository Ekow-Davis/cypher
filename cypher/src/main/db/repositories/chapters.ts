import { getDb } from '../index'
import type { Chapter } from '@shared/types'

/** Chapters repository — same pattern as books. */

export function listChapters(bookId: number): Chapter[] {
  return getDb()
    .prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY sort_order ASC, id ASC')
    .all(bookId) as Chapter[]
}

export function getChapter(id: number): Chapter | null {
  return (getDb().prepare('SELECT * FROM chapters WHERE id = ?').get(id) as Chapter) ?? null
}

export function createChapter(bookId: number, title?: string): Chapter {
  const db = getDb()
  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM chapters WHERE book_id = ?').get(bookId) as { c: number }
  ).c
  const maxOrder = (
    db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE book_id = ?')
      .get(bookId) as { m: number }
  ).m
  const finalTitle = title?.trim() || `Chapter ${count + 1}`
  const info = db
    .prepare('INSERT INTO chapters (book_id, title, sort_order) VALUES (?, ?, ?)')
    .run(bookId, finalTitle, maxOrder + 1)
  return getChapter(Number(info.lastInsertRowid)) as Chapter
}

/** Returns the book's chapters, creating "Chapter 1" if there are none. */
export function ensureFirstChapter(bookId: number): Chapter[] {
  const list = listChapters(bookId)
  if (list.length > 0) return list
  createChapter(bookId)
  return listChapters(bookId)
}

export function renameChapter(id: number, title: string): Chapter | null {
  getDb()
    .prepare('UPDATE chapters SET title = ? WHERE id = ?')
    .run(title.trim() || 'Untitled', id)
  return getChapter(id)
}

export function saveChapterContent(id: number, content: string, wordCount: number): Chapter | null {
  getDb()
    .prepare("UPDATE chapters SET content = ?, word_count = ?, updated_at = datetime('now') WHERE id = ?")
    .run(content, wordCount, id)
  return getChapter(id)
}

export function reorderChapters(orderedIds: number[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE chapters SET sort_order = ? WHERE id = ?')
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => stmt.run(index, id))
  })
  tx(orderedIds)
}

export function deleteChapter(id: number): void {
  getDb().prepare('DELETE FROM chapters WHERE id = ?').run(id)
}
