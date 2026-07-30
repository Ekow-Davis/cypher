import { getDb } from '../index'
import type { ReaderMark, CreateMarkInput, UpdateMarkInput } from '@shared/types'

export function listMarks(itemId: number): ReaderMark[] {
  return getDb()
    .prepare('SELECT * FROM reader_marks WHERE item_id = ? ORDER BY created_at ASC, id ASC')
    .all(itemId) as ReaderMark[]
}

function getMark(id: number): ReaderMark | null {
  return (getDb().prepare('SELECT * FROM reader_marks WHERE id = ?').get(id) as ReaderMark) ?? null
}

export function createMark(input: CreateMarkInput): ReaderMark {
  const info = getDb()
    .prepare(
      `INSERT INTO reader_marks (item_id, kind, location, label, excerpt, note, color, rects)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.itemId,
      input.kind,
      input.location,
      input.label ?? null,
      input.excerpt ?? null,
      input.note ?? null,
      input.color ?? null,
      input.rects ?? null
    )
  return getMark(Number(info.lastInsertRowid)) as ReaderMark
}

const FIELDS = ['note', 'color'] as const

export function updateMark(id: number, patch: UpdateMarkInput): ReaderMark | null {
  const entries = Object.entries(patch).filter(([k]) => (FIELDS as readonly string[]).includes(k))
  if (!entries.length) return getMark(id)
  const sets = entries.map(([k]) => `${k} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE reader_marks SET ${sets} WHERE id = ?`)
    .run(...entries.map(([, v]) => v as string | null), id)
  return getMark(id)
}

export function deleteMark(id: number): void {
  getDb().prepare('DELETE FROM reader_marks WHERE id = ?').run(id)
}
