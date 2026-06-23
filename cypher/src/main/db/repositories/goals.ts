import { getDb } from '../index'
import type { Goal } from '@shared/types'

/** One goal per owner (book/diary). */

export function getGoal(ownerType: string, ownerId: number): Goal | null {
  return (
    (getDb()
      .prepare('SELECT * FROM goals WHERE owner_type = ? AND owner_id = ?')
      .get(ownerType, ownerId) as Goal) ?? null
  )
}

export function upsertGoal(
  ownerType: string,
  ownerId: number,
  targetWords: number,
  deadline: string | null = null,
  writingDays: number[] = []
): Goal {
  const db = getDb()
  const existing = getGoal(ownerType, ownerId)
  const wd = JSON.stringify(writingDays)
  if (existing) {
    db.prepare('UPDATE goals SET target_words = ?, deadline = ?, writing_days = ? WHERE id = ?').run(
      targetWords,
      deadline,
      wd,
      existing.id
    )
  } else {
    db.prepare(
      'INSERT INTO goals (owner_type, owner_id, target_words, deadline, writing_days) VALUES (?, ?, ?, ?, ?)'
    ).run(ownerType, ownerId, targetWords, deadline, wd)
  }
  return getGoal(ownerType, ownerId) as Goal
}

export function deleteGoal(ownerType: string, ownerId: number): void {
  getDb().prepare('DELETE FROM goals WHERE owner_type = ? AND owner_id = ?').run(ownerType, ownerId)
}
