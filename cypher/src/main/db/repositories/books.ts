import { markDirty } from '../../sync'
import { getDb } from '../index'
import type { Book, CreateBookInput, ShelfFolder, UpdateBookInput } from '@shared/types'

/**
 * Books repository. This is the template every other entity (chapters,
 * characters, diary entries, ...) will follow: small, typed functions that
 * own all SQL for one table. The renderer never sees SQL — only these.
 */

// Columns the renderer is allowed to update (guards the dynamic UPDATE).
const UPDATABLE = [
  'title',
  'subtitle',
  'synopsis',
  'genre',
  'status',
  'cover_path',
  'author',
  'language',
  'numbering_style'
] as const

export function listBooks(includeArchived = false): Book[] {
  // The shelf shows word counts and sorts by last edit, so the list carries
  // a small summary per book rather than the shelf asking chapter by chapter.
  const sql = `
    SELECT b.*,
           COALESCE(c.words, 0)               AS word_count,
           COALESCE(c.n, 0)                   AS chapter_count,
           COALESCE(c.edited, b.created_at)   AS last_edited
      FROM books b
      LEFT JOIN (
        SELECT book_id, SUM(word_count) AS words, COUNT(*) AS n, MAX(updated_at) AS edited
          FROM chapters
         WHERE deleted_at IS NULL
         GROUP BY book_id
      ) c ON c.book_id = b.id
     WHERE b.deleted_at IS NULL ${includeArchived ? '' : 'AND b.archived = 0'}
     ORDER BY b.created_at DESC`
  return getDb().prepare(sql).all() as Book[]
}

export function getBook(id: number): Book | null {
  return (getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as Book) ?? null
}

export function createBook(input: CreateBookInput): Book {
  const info = getDb()
    .prepare('INSERT INTO books (title, subtitle, cover_path, folder_id) VALUES (?, ?, ?, ?)')
    .run(
      input.title.trim() || 'Untitled',
      input.subtitle ?? null,
      input.cover_path ?? null,
      input.folder_id ?? null
    )
  return getBook(Number(info.lastInsertRowid)) as Book
}

/**
 * Records the chapter last opened. Written directly rather than through
 * updateBook so it never marks the book dirty — where someone was reading is
 * their own business and has no place in a co-writer's sync.
 */
export function setLastChapter(bookId: number, chapterId: number | null): void {
  getDb().prepare('UPDATE books SET last_chapter_id = ? WHERE id = ?').run(chapterId, bookId)
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
  markDirty('book', id)
  return getBook(id)
}

export function archiveBook(id: number, archived: boolean): Book | null {
  getDb().prepare('UPDATE books SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
  return getBook(id)
}

/** Soft delete — the book moves to the trash and can be restored. */
export function deleteBook(id: number): void {
  getDb().prepare("UPDATE books SET deleted_at = datetime('now') WHERE id = ?").run(id)
}

// ---------- shelf folders (local only — never marked dirty, never synced) ----------

export function listFolders(): ShelfFolder[] {
  return getDb()
    .prepare('SELECT * FROM shelf_folders ORDER BY sort_order ASC, name COLLATE NOCASE ASC')
    .all() as ShelfFolder[]
}

export function createFolder(name: string): ShelfFolder {
  const db = getDb()
  const next = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM shelf_folders').get() as {
      n: number
    }
  ).n
  const info = db
    .prepare('INSERT INTO shelf_folders (name, sort_order) VALUES (?, ?)')
    .run(name.trim() || 'New folder', next)
  return db.prepare('SELECT * FROM shelf_folders WHERE id = ?').get(info.lastInsertRowid) as ShelfFolder
}

export function renameFolder(id: number, name: string): ShelfFolder | null {
  const db = getDb()
  if (name.trim()) db.prepare('UPDATE shelf_folders SET name = ? WHERE id = ?').run(name.trim(), id)
  return (db.prepare('SELECT * FROM shelf_folders WHERE id = ?').get(id) as ShelfFolder) ?? null
}

/** Removes the folder only; its books go back to sitting loose on the shelf. */
export function deleteFolder(id: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE books SET folder_id = NULL WHERE folder_id = ?').run(id)
    db.prepare('DELETE FROM shelf_folders WHERE id = ?').run(id)
  })()
}

export function setBookFolder(bookId: number, folderId: number | null): Book | null {
  getDb().prepare('UPDATE books SET folder_id = ? WHERE id = ?').run(folderId, bookId)
  return getBook(bookId)
}
