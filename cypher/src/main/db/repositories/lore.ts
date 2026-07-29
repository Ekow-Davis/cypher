import { getDb } from '../index'
import type { LoreEntry, CreateLoreOptions } from '@shared/types'

/** Lore (worldbuilding codex) repository — book-scoped, grouped by category. */

export function listLore(bookId: number): LoreEntry[] {
  return getDb()
    .prepare(
      'SELECT * FROM lore_entries WHERE book_id = ? ORDER BY category ASC, sort_order ASC, id ASC'
    )
    .all(bookId) as LoreEntry[]
}

export function getLore(id: number): LoreEntry | null {
  return (getDb().prepare('SELECT * FROM lore_entries WHERE id = ?').get(id) as LoreEntry) ?? null
}

function appendOrder(bookId: number, category: string): number {
  const row = getDb()
    .prepare(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM lore_entries WHERE book_id = ? AND category = ?'
    )
    .get(bookId, category) as { m: number }
  return row.m + 1
}

export function createLore(bookId: number, opts?: CreateLoreOptions): LoreEntry {
  const db = getDb()
  const category = opts?.category?.trim() || 'General'
  const title = opts?.title?.trim() || 'Untitled entry'
  const info = db
    .prepare('INSERT INTO lore_entries (book_id, title, category, sort_order) VALUES (?, ?, ?, ?)')
    .run(bookId, title, category, appendOrder(bookId, category))
  return getLore(Number(info.lastInsertRowid)) as LoreEntry
}

export function renameLore(id: number, title: string): LoreEntry | null {
  getDb()
    .prepare('UPDATE lore_entries SET title = ? WHERE id = ?')
    .run(title.trim() || 'Untitled entry', id)
  return getLore(id)
}

export function setLoreCategory(id: number, category: string): LoreEntry | null {
  const db = getDb()
  const entry = getLore(id)
  if (!entry) return null
  const cat = category.trim() || 'General'
  db.prepare('UPDATE lore_entries SET category = ?, sort_order = ? WHERE id = ?').run(
    cat,
    appendOrder(entry.book_id, cat),
    id
  )
  return getLore(id)
}

export function saveLoreContent(id: number, content: string): LoreEntry | null {
  getDb().prepare('UPDATE lore_entries SET content = ? WHERE id = ?').run(content, id)
  return getLore(id)
}

export function deleteLore(id: number): void {
  getDb().prepare('DELETE FROM lore_entries WHERE id = ?').run(id)
}
