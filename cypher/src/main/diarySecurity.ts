import { getDb } from './db'
import {
  makeVerifier,
  checkVerifier,
  generateContentKey,
  wrapContentKey,
  unwrapContentKey
} from './diaryCrypto'
import type { DiarySecurityStatus } from '@shared/types'

/**
 * Diary access control: two independent passwords (entry, translate), a
 * 5-minute lockout after repeated failures, and a 20-minute translation
 * window. The unwrapped content key and passwords live only in main-process
 * memory for this run — never written to disk, never sent to the renderer —
 * so a crash or restart always re-locks the diary.
 */

const LOCKOUT_MS = 5 * 60_000
const TRANSLATE_WINDOW_MS = 20 * 60_000
const MAX_ATTEMPTS = 5

let contentKey: Buffer | null = null
let translateUntil = 0

interface Row {
  entry_verifier: string | null
  translate_verifier: string | null
  wrapped_key: string | null
  fail_count: number
  locked_until: string | null
}

function row(): Row | null {
  return (getDb().prepare('SELECT * FROM diary_security WHERE id = 1').get() as Row) ?? null
}

export function securityStatus(): DiarySecurityStatus {
  const r = row()
  const lockedUntil = r?.locked_until ?? null
  const locked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now()
  return {
    configured: !!r?.entry_verifier,
    locked,
    lockedUntil: locked ? lockedUntil : null,
    failCount: r?.fail_count ?? 0
  }
}

export function isUnlocked(): boolean {
  return contentKey !== null
}
export function isTranslated(): boolean {
  return Date.now() < translateUntil
}
export function translateRemainingMs(): number {
  return Math.max(0, translateUntil - Date.now())
}
export function getContentKey(): Buffer | null {
  return contentKey
}

/** First-run setup: both passwords chosen together, a fresh content key generated once. */
export function setupDiary(entryPass: string, translatePass: string): void {
  const key = generateContentKey()
  const db = getDb()
  db.prepare(
    `INSERT INTO diary_security (id, entry_verifier, translate_verifier, wrapped_key, fail_count, locked_until)
     VALUES (1, ?, ?, ?, 0, NULL)
     ON CONFLICT(id) DO UPDATE SET
       entry_verifier = excluded.entry_verifier,
       translate_verifier = excluded.translate_verifier,
       wrapped_key = excluded.wrapped_key,
       fail_count = 0, locked_until = NULL`
  ).run(makeVerifier(entryPass), makeVerifier(translatePass), wrapContentKey(key, entryPass))
  contentKey = key
}

function recordFailure(): void {
  const db = getDb()
  const r = row()
  const count = (r?.fail_count ?? 0) + 1
  const lockUntil = count >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null
  db.prepare('UPDATE diary_security SET fail_count = ?, locked_until = ? WHERE id = 1').run(
    count,
    lockUntil
  )
}
function clearFailures(): void {
  getDb().prepare('UPDATE diary_security SET fail_count = 0, locked_until = NULL WHERE id = 1').run()
}

export interface UnlockResult {
  ok: boolean
  reason?: 'locked' | 'wrong-password' | 'not-configured'
  lockedUntil?: string
}

export function unlockDiary(password: string): UnlockResult {
  const status = securityStatus()
  if (!status.configured) return { ok: false, reason: 'not-configured' }
  if (status.locked) return { ok: false, reason: 'locked', lockedUntil: status.lockedUntil ?? undefined }

  const r = row()
  if (!r?.entry_verifier || !checkVerifier(r.entry_verifier, password) || !r.wrapped_key) {
    recordFailure()
    const after = securityStatus()
    return after.locked
      ? { ok: false, reason: 'locked', lockedUntil: after.lockedUntil ?? undefined }
      : { ok: false, reason: 'wrong-password' }
  }

  const key = unwrapContentKey(r.wrapped_key, password)
  if (!key) {
    // verifier and wrapped key should never disagree, but never unlock on a mismatch
    recordFailure()
    return { ok: false, reason: 'wrong-password' }
  }

  clearFailures()
  contentKey = key
  return { ok: true }
}

export function lockDiary(): void {
  contentKey = null
  translateUntil = 0
}

export function unlockTranslation(password: string): UnlockResult {
  const r = row()
  if (!r?.translate_verifier) return { ok: false, reason: 'not-configured' }
  if (!checkVerifier(r.translate_verifier, password)) return { ok: false, reason: 'wrong-password' }
  translateUntil = Date.now() + TRANSLATE_WINDOW_MS
  return { ok: true }
}
export function lockTranslation(): void {
  translateUntil = 0
}

/**
 * Changes either password without touching a single entry: only the wrapped
 * key is re-wrapped under the new entry password, and only the verifiers
 * change — the content key itself, and therefore every entry, is untouched.
 */
export function changePasswords(
  currentEntryPass: string,
  newEntryPass: string | null,
  newTranslatePass: string | null
): { ok: boolean; reason?: string } {
  const r = row()
  if (!r?.entry_verifier || !checkVerifier(r.entry_verifier, currentEntryPass) || !r.wrapped_key) {
    return { ok: false, reason: 'Current password is incorrect.' }
  }
  const key = unwrapContentKey(r.wrapped_key, currentEntryPass)
  if (!key) return { ok: false, reason: 'Could not verify the current password.' }

  const db = getDb()
  if (newEntryPass) {
    db.prepare('UPDATE diary_security SET entry_verifier = ?, wrapped_key = ? WHERE id = 1').run(
      makeVerifier(newEntryPass),
      wrapContentKey(key, newEntryPass)
    )
  }
  if (newTranslatePass) {
    db.prepare('UPDATE diary_security SET translate_verifier = ? WHERE id = 1').run(
      makeVerifier(newTranslatePass)
    )
  }
  contentKey = key
  return { ok: true }
}
