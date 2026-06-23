import { getDb } from '../index'
import type { Checkin } from '@shared/types'

/** Daily rows keyed by (owner, date): progress snapshot + mood/note. */

export function listCheckins(ownerType: string, ownerId: number, since?: string): Checkin[] {
  const db = getDb()
  if (since) {
    return db
      .prepare(
        'SELECT * FROM checkins WHERE owner_type = ? AND owner_id = ? AND date >= ? ORDER BY date ASC'
      )
      .all(ownerType, ownerId, since) as Checkin[]
  }
  return db
    .prepare('SELECT * FROM checkins WHERE owner_type = ? AND owner_id = ? ORDER BY date ASC')
    .all(ownerType, ownerId) as Checkin[]
}

export function getCheckin(ownerType: string, ownerId: number, date: string): Checkin | null {
  return (
    (getDb()
      .prepare('SELECT * FROM checkins WHERE owner_type = ? AND owner_id = ? AND date = ?')
      .get(ownerType, ownerId, date) as Checkin) ?? null
  )
}

/**
 * Records today's running word total and derives words-written from a per-day
 * baseline. The baseline is the previous day's ending total (so writing carries
 * across days); if there is no prior day, today's first total becomes the
 * baseline (so same-day writing still counts).
 */
export function snapshotProgress(
  ownerType: string,
  ownerId: number,
  date: string,
  totalWords: number
): Checkin {
  const db = getDb()
  const existing = getCheckin(ownerType, ownerId, date)

  // Baseline already established for today (and not a mood-only row): just update.
  if (existing && existing.day_start_words != null) {
    const written = Math.max(0, totalWords - existing.day_start_words)
    db.prepare('UPDATE checkins SET total_words = ?, words_written = ? WHERE id = ?').run(
      totalWords,
      written,
      existing.id
    )
    return getCheckin(ownerType, ownerId, date) as Checkin
  }

  // First snapshot today: derive the baseline from the previous day's total.
  const prev = db
    .prepare(
      'SELECT total_words FROM checkins WHERE owner_type = ? AND owner_id = ? AND date < ? AND day_start_words IS NOT NULL ORDER BY date DESC LIMIT 1'
    )
    .get(ownerType, ownerId, date) as { total_words: number } | undefined
  const dayStart = prev ? prev.total_words : totalWords
  const written = Math.max(0, totalWords - dayStart)

  if (existing) {
    // a mood-only row exists for today; attach the baseline now
    db.prepare(
      'UPDATE checkins SET total_words = ?, words_written = ?, day_start_words = ? WHERE id = ?'
    ).run(totalWords, written, dayStart, existing.id)
  } else {
    db.prepare(
      'INSERT INTO checkins (owner_type, owner_id, date, words_written, total_words, day_start_words) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(ownerType, ownerId, date, written, totalWords, dayStart)
  }
  return getCheckin(ownerType, ownerId, date) as Checkin
}

export function setMood(
  ownerType: string,
  ownerId: number,
  date: string,
  mood: string | null,
  note: string | null
): Checkin {
  getDb()
    .prepare(
      `INSERT INTO checkins (owner_type, owner_id, date, mood, note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(owner_type, owner_id, date)
       DO UPDATE SET mood = excluded.mood, note = excluded.note`
    )
    .run(ownerType, ownerId, date, mood, note)
  return getCheckin(ownerType, ownerId, date) as Checkin
}
