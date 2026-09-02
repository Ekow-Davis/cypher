import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import { getSetting } from './settings'
import { readToken, onlineEnabled, storedProfile } from './account'
import { syncBook } from './sync'

/**
 * Turning a book online, and bringing it back.
 *
 * Both directions are explicit and reversible: a book only leaves this machine
 * when the writer says so, and taking it offline pulls everything down first so
 * nothing is stranded on the server.
 */

function serverUrl(): string {
  return String(getSetting('shareServerUrl') ?? '')
    .trim()
    .replace(/\/+$/, '')
}

export interface OnlineResult {
  ok: boolean
  reason?: string
}

export async function makeBookOnline(bookId: number): Promise<OnlineResult> {
  if (!onlineEnabled()) {
    return { ok: false, reason: 'Turn on online features in Settings → Data first.' }
  }
  const token = readToken()
  const profile = storedProfile()
  const base = serverUrl()
  if (!token || !profile) return { ok: false, reason: 'Sign in to your Cypher account first.' }
  if (!base) return { ok: false, reason: 'Set your Cypher server URL in Settings → Data.' }

  const db = getDb()
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as
    | Record<string, unknown>
    | undefined
  if (!book) return { ok: false, reason: 'Book not found.' }
  if (book.online) return { ok: true }

  const remoteId = randomUUID()
  try {
    const response = await fetch(`${base}/api/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: remoteId,
        book: {
          title: book.title,
          subtitle: book.subtitle,
          synopsis: book.synopsis,
          genre: book.genre,
          status: book.status,
          author: book.author,
          language: book.language,
          numbering_style: book.numbering_style
        }
      })
    })
    if (!response.ok) {
      return { ok: false, reason: `The server refused the book (${response.status}).` }
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }

  // Everything is marked dirty so the first sync uploads the whole book rather
  // than only what changes afterwards.
  const start = db.transaction(() => {
    db.prepare(
      `UPDATE books SET online = 1, remote_id = ?, owner_id = ?, owner_name = ?,
         revision = 0, dirty = 1 WHERE id = ?`
    ).run(remoteId.replace(/-/g, ''), profile.id, profile.displayName, bookId)
    db.prepare('UPDATE chapters SET dirty = 1 WHERE book_id = ?').run(bookId)
    db.prepare('UPDATE volumes SET dirty = 1 WHERE book_id = ?').run(bookId)
  })
  start()

  await syncBook(bookId)
  return { ok: true }
}

/**
 * Brings a book back to this machine only.
 *
 * A final sync runs first so anything written elsewhere is pulled down before
 * the server copy goes — otherwise going offline could quietly discard a
 * collaborator's last few paragraphs.
 */
export async function takeBookOffline(bookId: number): Promise<OnlineResult> {
  const db = getDb()
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as
    | { remote_id: string | null; owner_id: string | null; online: number }
    | undefined
  if (!book?.online) return { ok: true }

  await syncBook(bookId)

  const token = readToken()
  const base = serverUrl()
  const profile = storedProfile()
  const isOwner = profile && book.owner_id === profile.id

  if (token && base && book.remote_id && isOwner) {
    try {
      const id = book.remote_id.includes('-')
        ? book.remote_id
        : `${book.remote_id.slice(0, 8)}-${book.remote_id.slice(8, 12)}-${book.remote_id.slice(12, 16)}-${book.remote_id.slice(16, 20)}-${book.remote_id.slice(20, 32)}`
      await fetch(`${base}/api/books/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch {
      // The local copy is already complete, so a failed delete leaves an
      // orphaned server record rather than losing anything.
    }
  }

  db.prepare(
    `UPDATE books SET online = 0, remote_id = NULL, owner_id = NULL, owner_name = NULL,
       revision = 0, dirty = 0, last_synced_at = NULL WHERE id = ?`
  ).run(bookId)
  db.prepare('DELETE FROM sync_deletions WHERE book_id = ?').run(bookId)
  return { ok: true }
}

export interface OnlineInfo {
  online: boolean
  ownerName: string | null
  isOwner: boolean
  lastSyncedAt: string | null
}

export function onlineInfo(bookId: number): OnlineInfo {
  const book = getDb()
    .prepare('SELECT online, owner_id, owner_name, last_synced_at FROM books WHERE id = ?')
    .get(bookId) as
    | { online: number; owner_id: string | null; owner_name: string | null; last_synced_at: string | null }
    | undefined
  const profile = storedProfile()
  return {
    online: !!book?.online,
    ownerName: book?.owner_name ?? null,
    isOwner: !!book?.owner_id && book.owner_id === profile?.id,
    lastSyncedAt: book?.last_synced_at ?? null
  }
}


/**
 * What the renderer needs to talk to the collaboration API directly.
 *
 * The token stays in main; only a short-lived copy crosses to the renderer,
 * and only when online features are on — the renderer never reads the keychain.
 */
export function collabConfig(): { baseUrl: string; token: string } | null {
  if (!onlineEnabled()) return null
  const token = readToken()
  const base = serverUrl()
  if (!token || !base) return null
  return { baseUrl: base, token }
}

/** The book's server-side id, in the UUID form the API expects. */
export function bookRemoteId(bookId: number): string | null {
  const row = getDb().prepare('SELECT remote_id FROM books WHERE id = ?').get(bookId) as
    | { remote_id: string | null }
    | undefined
  if (!row?.remote_id) return null
  const hex = row.remote_id
  return hex.includes('-')
    ? hex
    : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function chapterRemoteId(chapterId: number): string | null {
  const row = getDb().prepare('SELECT remote_id FROM chapters WHERE id = ?').get(chapterId) as
    | { remote_id: string | null }
    | undefined
  if (!row?.remote_id) return null
  const hex = row.remote_id
  return hex.includes('-')
    ? hex
    : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/* ---------------- collaborators ---------------- */

export interface Collaborator {
  id: string
  displayName: string
  isOwner: boolean
}

export async function listCollaborators(bookId: number): Promise<Collaborator[]> {
  const config = collabConfig()
  const remote = bookRemoteId(bookId)
  if (!config || !remote) return []
  try {
    const response = await fetch(`${config.baseUrl}/api/books/${remote}/collaborators`, {
      headers: { Authorization: `Bearer ${config.token}` }
    })
    if (!response.ok) return []
    const data = (await response.json()) as { collaborators: Collaborator[] }
    return data.collaborators ?? []
  } catch {
    return []
  }
}

export async function addCollaborator(
  bookId: number,
  userId: string,
  joinCode: string
): Promise<{ ok: boolean; displayName?: string; reason?: string }> {
  const config = collabConfig()
  const remote = bookRemoteId(bookId)
  if (!config || !remote) return { ok: false, reason: 'This book is not online.' }
  try {
    const response = await fetch(`${config.baseUrl}/api/books/${remote}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ userId: userId.trim(), joinCode: joinCode.trim() })
    })
    const body = (await response.json().catch(() => ({}))) as {
      displayName?: string
      error?: string
    }
    if (!response.ok) return { ok: false, reason: body.error ?? 'Could not add that writer.' }
    return { ok: true, displayName: body.displayName }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function removeCollaborator(
  bookId: number,
  userId: string
): Promise<{ ok: boolean; reason?: string }> {
  const config = collabConfig()
  const remote = bookRemoteId(bookId)
  if (!config || !remote) return { ok: false, reason: 'This book is not online.' }
  try {
    const response = await fetch(
      `${config.baseUrl}/api/books/${remote}/collaborators/${userId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${config.token}` } }
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      return { ok: false, reason: body.error ?? 'Could not remove that writer.' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
