import { getDb } from '../index'
import { getSetting } from '../../settings'
import type { TrashItem, TrashKind } from '@shared/types'

/**
 * The trash is a view over soft-deleted rows in the content tables, rather
 * than a table of its own — restoring is just clearing the stamp, so nothing
 * has to be copied out and back, and no data can be lost in the round trip.
 */

const TABLE: Record<TrashKind, string> = {
  book: 'books',
  chapter: 'chapters',
  lore: 'lore_entries',
  character: 'characters',
  document: 'documents'
}

export function listTrash(): TrashItem[] {
  const db = getDb()
  const rows: TrashItem[] = []

  const books = db
    .prepare(
      "SELECT id, title, deleted_at FROM books WHERE deleted_at IS NOT NULL"
    )
    .all() as { id: number; title: string; deleted_at: string }[]
  rows.push(...books.map((b) => ({ kind: 'book' as const, ...b, context: null })))

  const chapters = db
    .prepare(
      `SELECT c.id, c.title, c.deleted_at, b.title AS context
       FROM chapters c LEFT JOIN books b ON b.id = c.book_id
       WHERE c.deleted_at IS NOT NULL`
    )
    .all() as { id: number; title: string; deleted_at: string; context: string | null }[]
  rows.push(...chapters.map((c) => ({ kind: 'chapter' as const, ...c })))

  const lore = db
    .prepare(
      `SELECT l.id, l.title, l.deleted_at, b.title AS context
       FROM lore_entries l LEFT JOIN books b ON b.id = l.book_id
       WHERE l.deleted_at IS NOT NULL`
    )
    .all() as { id: number; title: string; deleted_at: string; context: string | null }[]
  rows.push(...lore.map((l) => ({ kind: 'lore' as const, ...l })))

  const characters = db
    .prepare(
      `SELECT ch.id, ch.name AS title, ch.deleted_at, b.title AS context
       FROM characters ch LEFT JOIN books b ON b.id = ch.book_id
       WHERE ch.deleted_at IS NOT NULL`
    )
    .all() as { id: number; title: string; deleted_at: string; context: string | null }[]
  rows.push(...characters.map((c) => ({ kind: 'character' as const, ...c })))

  const documents = db
    .prepare('SELECT id, title, deleted_at FROM documents WHERE deleted_at IS NOT NULL')
    .all() as { id: number; title: string; deleted_at: string }[]
  rows.push(...documents.map((d) => ({ kind: 'document' as const, ...d, context: null })))

  return rows.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
}

export function restoreTrashItem(kind: TrashKind, id: number): boolean {
  const table = TABLE[kind]
  if (!table) return false
  getDb().prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id)
  return true
}

/** Permanent removal. For books this cascades to their chapters and lore. */
export function purgeTrashItem(kind: TrashKind, id: number): boolean {
  const table = TABLE[kind]
  if (!table) return false
  getDb().prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id)
  return true
}

export function emptyTrash(): number {
  const db = getDb()
  let n = 0
  const tx = db.transaction(() => {
    for (const table of Object.values(TABLE)) {
      const r = db.prepare(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL`).run()
      n += r.changes
    }
  })
  tx()
  return n
}

/** Drops trashed rows older than the retention window. Runs at startup. */
export function purgeExpiredTrash(): number {
  const days = Number(getSetting('trashRetentionDays') ?? 7)
  if (days <= 0) return 0
  const db = getDb()
  let n = 0
  const cutoff = `-${Math.floor(days)} days`
  const tx = db.transaction(() => {
    for (const table of Object.values(TABLE)) {
      const r = db
        .prepare(
          `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`
        )
        .run(cutoff)
      n += r.changes
    }
  })
  tx()
  return n
}
