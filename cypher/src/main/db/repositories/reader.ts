import { getDb } from '../index'
import type { ReaderItem, ReaderFormat } from '@shared/types'

export function listReaderItems(): ReaderItem[] {
  return getDb()
    .prepare('SELECT * FROM reader_items ORDER BY added_at DESC, id DESC')
    .all() as ReaderItem[]
}

export function getReaderItem(id: number): ReaderItem | null {
  return (getDb().prepare('SELECT * FROM reader_items WHERE id = ?').get(id) as ReaderItem) ?? null
}

export function createReaderItem(input: {
  title: string
  author?: string | null
  format: ReaderFormat
  filePath: string
  sourcePath?: string | null
}): ReaderItem {
  const info = getDb()
    .prepare(
      'INSERT INTO reader_items (title, author, format, file_path, source_path) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      input.title.trim() || 'Untitled',
      input.author?.trim() || null,
      input.format,
      input.filePath,
      input.sourcePath ?? null
    )
  return getReaderItem(Number(info.lastInsertRowid)) as ReaderItem
}

export function renameReaderItem(id: number, title: string): ReaderItem | null {
  getDb()
    .prepare('UPDATE reader_items SET title = ? WHERE id = ?')
    .run(title.trim() || 'Untitled', id)
  return getReaderItem(id)
}

export function setReaderAuthor(id: number, author: string | null): ReaderItem | null {
  getDb().prepare('UPDATE reader_items SET author = ? WHERE id = ?').run(author?.trim() || null, id)
  return getReaderItem(id)
}

export function setReaderCover(id: number, coverPath: string | null): ReaderItem | null {
  getDb().prepare('UPDATE reader_items SET cover_path = ? WHERE id = ?').run(coverPath, id)
  return getReaderItem(id)
}

export function updateReaderLocation(
  id: number,
  location: string | null,
  progress?: number
): ReaderItem | null {
  const db = getDb()
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    const clamped = Math.max(0, Math.min(1, progress))
    db.prepare(
      "UPDATE reader_items SET last_location = ?, progress = ?, last_read_at = datetime('now') WHERE id = ?"
    ).run(location, clamped, id)
  } else {
    db.prepare(
      "UPDATE reader_items SET last_location = ?, last_read_at = datetime('now') WHERE id = ?"
    ).run(location, id)
  }
  return getReaderItem(id)
}

/** Returns the deleted row (so its files can be cleaned up), or null. */
export function deleteReaderItem(id: number): ReaderItem | null {
  const row = getReaderItem(id)
  if (!row) return null
  getDb().prepare('DELETE FROM reader_items WHERE id = ?').run(id)
  return row
}
