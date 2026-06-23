import { getDb } from '../index'
import type { Volume } from '@shared/types'

/** Volumes (parts) repository. */

export function listVolumes(bookId: number): Volume[] {
  return getDb()
    .prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY sort_order ASC, id ASC')
    .all(bookId) as Volume[]
}

function getVolume(id: number): Volume | null {
  return (getDb().prepare('SELECT * FROM volumes WHERE id = ?').get(id) as Volume) ?? null
}

export function createVolume(bookId: number, title?: string): Volume {
  const db = getDb()
  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM volumes WHERE book_id = ?').get(bookId) as { c: number }
  ).c
  const maxOrder = (
    db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM volumes WHERE book_id = ?')
      .get(bookId) as { m: number }
  ).m
  const finalTitle = title?.trim() || `Volume ${count + 1}`
  const info = db
    .prepare('INSERT INTO volumes (book_id, title, sort_order) VALUES (?, ?, ?)')
    .run(bookId, finalTitle, maxOrder + 1)
  return getVolume(Number(info.lastInsertRowid)) as Volume
}

export function renameVolume(id: number, title: string): Volume | null {
  getDb().prepare('UPDATE volumes SET title = ? WHERE id = ?').run(title.trim() || 'Untitled', id)
  return getVolume(id)
}

// By default, chapters in a deleted volume fall back to "unsorted" via
// ON DELETE SET NULL. If deleteChapters is true, they are removed too.
export function deleteVolume(id: number, deleteChapters = false): void {
  const db = getDb()
  if (deleteChapters) {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM chapters WHERE volume_id = ?').run(id)
      db.prepare('DELETE FROM volumes WHERE id = ?').run(id)
    })
    tx()
  } else {
    db.prepare('DELETE FROM volumes WHERE id = ?').run(id)
  }
}

export function reorderVolumes(orderedIds: number[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE volumes SET sort_order = ? WHERE id = ?')
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => stmt.run(index, id))
  })
  tx(orderedIds)
}
