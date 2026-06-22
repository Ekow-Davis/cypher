import { getDb } from '../index'
import type { Book, CreateBookInput, UpdateBookInput } from '@shared/types'

/**
 * Books repository. This is the template every other entity (chapters,
 * characters, diary entries, ...) will follow: small, typed functions that
 * own all SQL for one table. The renderer never sees SQL — only these.
 */

// Columns the renderer is allowed to update (guards the dynamic UPDATE).
const UPDATABLE = ['title', 'subtitle', 'synopsis', 'genre', 'status', 'cover_path'] as const

export function listBooks(includeArchived = false): Book[] {
  const sql = includeArchived
    ? 'SELECT * FROM books ORDER BY created_at DESC'
    : 'SELECT * FROM books WHERE archived = 0 ORDER BY created_at DESC'
  return getDb().prepare(sql).all() as Book[]
}

export function getBook(id: number): Book | null {
  return (getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as Book) ?? null
}

export function createBook(input: CreateBookInput): Book {
  const info = getDb()
    .prepare('INSERT INTO books (title, subtitle) VALUES (?, ?)')
    .run(input.title.trim() || 'Untitled', input.subtitle ?? null)
  return getBook(Number(info.lastInsertRowid)) as Book
}

export function updateBook(id: number, patch: UpdateBookInput): Book | null {
  const keys = Object.keys(patch).filter((k) =>
    (UPDATABLE as readonly string[]).includes(k)
  )
  if (keys.length === 0) return getBook(id)
  const sets = keys.map((k) => `${k} = @${k}`).join(', ')
  const params: Record<string, unknown> = { id }
  for (const k of keys) params[k] = (patch as Record<string, unknown>)[k]
  getDb()
    .prepare(`UPDATE books SET ${sets} WHERE id = @id`)
    .run(params)
  return getBook(id)
}

export function archiveBook(id: number, archived: boolean): Book | null {
  getDb().prepare('UPDATE books SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
  return getBook(id)
}

export function deleteBook(id: number): void {
  getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
}
