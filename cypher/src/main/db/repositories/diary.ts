import { getDb } from '../index'
import { encryptWithKey, decryptWithKey, serialize, deserialize } from '../../diaryCrypto'
import { getContentKey } from '../../diarySecurity'
import type { Diary, DiaryEntry, CreateEntryInput } from '@shared/types'

/** Diaries (folders) and entries. Content is opaque ciphertext until unlocked. */

export function listDiaries(): Diary[] {
  return getDb().prepare('SELECT * FROM diaries ORDER BY sort_order ASC, id ASC').all() as Diary[]
}

export function createDiary(name: string): Diary {
  const db = getDb()
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM diaries').get() as { m: number }
  ).m
  const info = db
    .prepare('INSERT INTO diaries (name, sort_order) VALUES (?, ?)')
    .run(name.trim() || 'Untitled', maxOrder + 1)
  return getDb().prepare('SELECT * FROM diaries WHERE id = ?').get(info.lastInsertRowid) as Diary
}

export function renameDiary(id: number, name: string): Diary | null {
  getDb().prepare('UPDATE diaries SET name = ? WHERE id = ?').run(name.trim() || 'Untitled', id)
  return (getDb().prepare('SELECT * FROM diaries WHERE id = ?').get(id) as Diary) ?? null
}

export function deleteDiary(id: number): void {
  // entries fall back to standalone (diary_id NULL) rather than being deleted
  getDb().prepare('UPDATE diary_entries SET diary_id = NULL WHERE diary_id = ?').run(id)
  getDb().prepare('DELETE FROM diaries WHERE id = ?').run(id)
}

type RawEntry = Omit<DiaryEntry, 'title' | 'content'> & { title: string | null; content: string | null }

function decryptRow(raw: RawEntry): DiaryEntry | null {
  const key = getContentKey()
  if (!key) return null
  const titlePayload = raw.title ? deserialize(raw.title) : null
  const contentPayload = raw.content ? deserialize(raw.content) : null
  const title = titlePayload ? (decryptWithKey(titlePayload, key) ?? '(unreadable)') : ''
  const content = contentPayload ? (decryptWithKey(contentPayload, key) ?? '(unreadable)') : ''
  return { ...raw, title, content }
}

/** Returns entries decrypted with the current session key; empty if locked. */
export function listEntries(diaryId: number | null): DiaryEntry[] {
  const rows = (
    diaryId === null
      ? getDb().prepare('SELECT * FROM diary_entries WHERE diary_id IS NULL ORDER BY sort_order DESC, id DESC').all()
      : getDb()
          .prepare('SELECT * FROM diary_entries WHERE diary_id = ? ORDER BY sort_order DESC, id DESC')
          .all(diaryId)
  ) as RawEntry[]
  return rows.map(decryptRow).filter((e): e is DiaryEntry => e !== null)
}

export function createEntry(input: CreateEntryInput): DiaryEntry | null {
  const key = getContentKey()
  if (!key) return null
  const db = getDb()

  const now = new Date()
  const monthGroup = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const scope = input.diaryId
  const maxOrder = (
    scope === null
      ? (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM diary_entries WHERE diary_id IS NULL').get() as { m: number })
      : (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM diary_entries WHERE diary_id = ?').get(scope) as { m: number })
  ).m
  const entryNumber = (
    scope === null
      ? (db.prepare('SELECT COUNT(*) AS c FROM diary_entries WHERE diary_id IS NULL').get() as { c: number })
      : (db.prepare('SELECT COUNT(*) AS c FROM diary_entries WHERE diary_id = ?').get(scope) as { c: number })
  ).c + 1

  const titleCipher = serialize(encryptWithKey(input.title, key))
  const contentCipher = serialize(encryptWithKey(input.content, key))

  const info = db
    .prepare(
      `INSERT INTO diary_entries (diary_id, entry_number, title, content, month_group, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(scope, entryNumber, titleCipher, contentCipher, monthGroup, maxOrder + 1)

  const raw = db
    .prepare('SELECT * FROM diary_entries WHERE id = ?')
    .get(info.lastInsertRowid) as RawEntry
  return decryptRow(raw)
}

export function saveEntry(id: number, title: string, content: string): DiaryEntry | null {
  const key = getContentKey()
  if (!key) return null
  const db = getDb()
  db.prepare(
    "UPDATE diary_entries SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(serialize(encryptWithKey(title, key)), serialize(encryptWithKey(content, key)), id)
  const raw = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(id) as RawEntry
  return decryptRow(raw)
}

export function deleteEntry(id: number): void {
  getDb().prepare('DELETE FROM diary_entries WHERE id = ?').run(id)
}

/** Month groups with counts, for the calendar-style list — diary_id null means "all". */
export function listMonthGroups(diaryId: number | null): { month: string; count: number }[] {
  const rows =
    diaryId === null
      ? getDb()
          .prepare(
            'SELECT month_group AS month, COUNT(*) AS count FROM diary_entries WHERE diary_id IS NULL GROUP BY month_group ORDER BY month_group DESC'
          )
          .all()
      : getDb()
          .prepare(
            'SELECT month_group AS month, COUNT(*) AS count FROM diary_entries WHERE diary_id = ? GROUP BY month_group ORDER BY month_group DESC'
          )
          .all(diaryId)
  return rows as { month: string; count: number }[]
}
