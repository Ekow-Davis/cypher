import { getDb } from '../index'
import type { Note, UpdateNoteInput } from '@shared/types'

/** Pinned notes — small sticky notes scoped to an owner (a book, later a diary). */

export function listNotes(ownerType: string, ownerId: number): Note[] {
  return getDb()
    .prepare('SELECT * FROM notes WHERE owner_type = ? AND owner_id = ? ORDER BY slot ASC, id ASC')
    .all(ownerType, ownerId) as Note[]
}

function getNote(id: number): Note | null {
  return (getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note) ?? null
}

export function createNote(ownerType: string, ownerId: number): Note {
  const db = getDb()
  const next = (
    db
      .prepare('SELECT COALESCE(MAX(slot), -1) AS m FROM notes WHERE owner_type = ? AND owner_id = ?')
      .get(ownerType, ownerId) as { m: number }
  ).m
  const info = db
    .prepare('INSERT INTO notes (owner_type, owner_id, slot) VALUES (?, ?, ?)')
    .run(ownerType, ownerId, next + 1)
  return getNote(Number(info.lastInsertRowid)) as Note
}

const NOTE_FIELDS = ['title', 'content', 'color'] as const

export function updateNote(id: number, patch: UpdateNoteInput): Note | null {
  const entries = Object.entries(patch).filter(([k]) =>
    (NOTE_FIELDS as readonly string[]).includes(k)
  )
  if (entries.length === 0) return getNote(id)
  const sets = entries.map(([k]) => `${k} = ?`).join(', ')
  const values = entries.map(([, v]) => v as string | null)
  getDb()
    .prepare(`UPDATE notes SET ${sets} WHERE id = ?`)
    .run(...values, id)
  return getNote(id)
}

export function deleteNote(id: number): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}
