import { getDb } from '../index'
import type { TimelineItem, TimelineUpsert } from '@shared/types'

/** The in-world timeline for a book: dated chapters, entries, characters and events. */

export function listTimeline(bookId: number): TimelineItem[] {
  return getDb()
    .prepare('SELECT * FROM timeline_items WHERE book_id = ? ORDER BY start_at ASC, id ASC')
    .all(bookId) as TimelineItem[]
}

function getItem(id: number): TimelineItem | null {
  return (getDb().prepare('SELECT * FROM timeline_items WHERE id = ?').get(id) as TimelineItem) ?? null
}

/**
 * Creates or updates one dated item. Chapters, entries and characters have at
 * most one row each, so they are matched on (kind, ref) when no id is given;
 * events are always matched by id.
 */
export function upsertTimeline(input: TimelineUpsert): TimelineItem | null {
  const db = getDb()
  const start = Number(input.start_at)
  if (!Number.isFinite(start)) return null
  const end =
    input.end_at === null || input.end_at === undefined || !Number.isFinite(Number(input.end_at))
      ? null
      : Number(input.end_at)

  let existing: TimelineItem | null = null
  if (input.id) existing = getItem(input.id)
  else if (input.kind !== 'event' && input.refId != null) {
    existing =
      (db
        .prepare('SELECT * FROM timeline_items WHERE book_id = ? AND kind = ? AND ref_id = ?')
        .get(input.bookId, input.kind, input.refId) as TimelineItem) ?? null
  }

  if (existing) {
    db.prepare(
      `UPDATE timeline_items SET title = ?, note = ?, start_at = ?, end_at = ?, label = ?, color = ?
       WHERE id = ?`
    ).run(
      input.title ?? existing.title,
      input.note ?? existing.note,
      start,
      input.end_at === undefined ? existing.end_at : end,
      input.label ?? existing.label,
      input.color === undefined ? existing.color : input.color,
      existing.id
    )
    return getItem(existing.id)
  }

  const info = db
    .prepare(
      `INSERT INTO timeline_items (book_id, kind, ref_id, title, note, start_at, end_at, label, color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.bookId,
      input.kind,
      input.kind === 'event' ? null : input.refId,
      input.title ?? '',
      input.note ?? '',
      start,
      end,
      input.label ?? '',
      input.color ?? null
    )
  return getItem(Number(info.lastInsertRowid))
}

export function deleteTimeline(id: number): void {
  getDb().prepare('DELETE FROM timeline_items WHERE id = ?').run(id)
}
