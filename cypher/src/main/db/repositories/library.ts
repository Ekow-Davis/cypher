import { getDb } from '../index'
import type { LibraryLoreEntry, LoreEntry } from '@shared/types'

/**
 * The shared lore library — entries that live outside any one book.
 *
 * Moving lore in and out is always a copy: a book's entry remembers which
 * library entry it came from (`library_id`) so the two can be compared, but
 * editing one never changes the other until the writer pushes or pulls.
 */

export function listLibrary(): LibraryLoreEntry[] {
  return getDb()
    .prepare('SELECT * FROM library_lore ORDER BY category COLLATE NOCASE, title COLLATE NOCASE')
    .all() as LibraryLoreEntry[]
}

function getLibraryEntry(id: number): LibraryLoreEntry | null {
  return (getDb().prepare('SELECT * FROM library_lore WHERE id = ?').get(id) as LibraryLoreEntry) ?? null
}

/**
 * Sends a book's lore entry to the library: updates the linked library entry
 * if there is one, otherwise creates it and links the two. `content` is passed
 * in already prepared by the renderer (references made book-independent).
 */
export function pushToLibrary(loreId: number, content: string): LibraryLoreEntry | null {
  const db = getDb()
  const entry = db.prepare('SELECT * FROM lore_entries WHERE id = ?').get(loreId) as
    | (LoreEntry & { library_id: number | null })
    | undefined
  if (!entry) return null

  const linked = entry.library_id ? getLibraryEntry(entry.library_id) : null
  if (linked) {
    db.prepare(
      `UPDATE library_lore SET title = ?, category = ?, content = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(entry.title, entry.category, content, linked.id)
    return getLibraryEntry(linked.id)
  }
  const info = db
    .prepare('INSERT INTO library_lore (title, category, content) VALUES (?, ?, ?)')
    .run(entry.title, entry.category, content)
  const id = Number(info.lastInsertRowid)
  db.prepare('UPDATE lore_entries SET library_id = ? WHERE id = ?').run(id, loreId)
  return getLibraryEntry(id)
}

/** Links an existing book entry to a library entry (after an import). */
export function linkLoreToLibrary(loreId: number, libraryId: number | null): void {
  getDb().prepare('UPDATE lore_entries SET library_id = ? WHERE id = ?').run(libraryId, loreId)
}

export function renameLibraryEntry(id: number, title: string, category: string): LibraryLoreEntry | null {
  getDb()
    .prepare(`UPDATE library_lore SET title = ?, category = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(title.trim() || 'Untitled entry', category.trim() || 'General', id)
  return getLibraryEntry(id)
}

/** Removes a library entry. Book copies stay; they just lose their link. */
export function deleteLibraryEntry(id: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE lore_entries SET library_id = NULL WHERE library_id = ?').run(id)
    db.prepare('DELETE FROM library_lore WHERE id = ?').run(id)
  })()
}
