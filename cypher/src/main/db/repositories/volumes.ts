import { markDirty, queueDeletion } from '../../sync'
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

/**
 * Sets whether a volume's chapters take part in the running chapter count.
 * A label lets an excluded volume keep its own sequence (Interlude 1, 2…)
 * instead of showing no number at all.
 */
export function setVolumeNumbering(
  id: number,
  numbered: boolean,
  unnumberedLabel: string
): void {
  getDb()
    .prepare('UPDATE volumes SET numbered = ?, unnumbered_label = ? WHERE id = ?')
    .run(numbered ? 1 : 0, unnumberedLabel.trim(), id)
  markDirty('volume', id)
}

export function renameVolume(id: number, title: string): Volume | null {
  getDb().prepare('UPDATE volumes SET title = ? WHERE id = ?').run(title.trim() || 'Untitled', id)
  markDirty('volume', id)
  return getVolume(id)
}

// By default, chapters in a deleted volume fall back to "unsorted" via
// ON DELETE SET NULL. If deleteChapters is true, they are removed too.
export function deleteVolume(id: number, deleteChapters = false): void {
  const db = getDb()
  // Captured before the row goes: afterwards there is nothing left to tell the
  // server which volume was removed.
  const row = db
    .prepare('SELECT book_id, remote_id FROM volumes WHERE id = ?')
    .get(id) as { book_id: number; remote_id: string | null } | undefined
  const doomedChapters = deleteChapters
    ? (db
        .prepare('SELECT id, remote_id FROM chapters WHERE volume_id = ?')
        .all(id) as { id: number; remote_id: string | null }[])
    : []

  if (deleteChapters) {
    const tx = db.transaction(() => {
      db.prepare("UPDATE chapters SET deleted_at = datetime('now') WHERE volume_id = ?").run(id)
      db.prepare('DELETE FROM volumes WHERE id = ?').run(id)
    })
    tx()
  } else {
    db.prepare('DELETE FROM volumes WHERE id = ?').run(id)
  }

  if (row?.remote_id) queueDeletion('volume', row.book_id, row.remote_id)
  for (const chapter of doomedChapters) {
    if (chapter.remote_id && row) queueDeletion('chapter', row.book_id, chapter.remote_id)
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
