import { randomBytes } from 'node:crypto'
import { getDb } from '../index'
import type { ShareLink, CreateShareInput, ShareScope } from '@shared/types'

/**
 * Share links. Tokens are generated locally so a link exists — and its
 * snapshot can be exported — before anything is published to a server.
 */

function newToken(): string {
  // 16 bytes of base64url: unguessable, URL-safe, and short enough to paste.
  return randomBytes(16).toString('base64url')
}

export function listShares(bookId: number): ShareLink[] {
  return getDb()
    .prepare('SELECT * FROM share_links WHERE book_id = ? ORDER BY created_at DESC, id DESC')
    .all(bookId) as ShareLink[]
}

export function getShare(id: number): ShareLink | null {
  return (getDb().prepare('SELECT * FROM share_links WHERE id = ?').get(id) as ShareLink) ?? null
}

export function createShare(input: CreateShareInput): ShareLink {
  const info = getDb()
    .prepare(
      `INSERT INTO share_links (book_id, token, label, scope_json, expires_at, active)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .run(
      input.bookId,
      newToken(),
      input.label.trim() || 'Shared link',
      JSON.stringify(input.scope),
      input.expiresAt
    )
  return getShare(Number(info.lastInsertRowid)) as ShareLink
}

/**
 * Edits a link without changing its token.
 *
 * The whole point of a share link is that the URL you already gave people
 * keeps working — so scope, label and expiry are mutable while the token is
 * not. Re-publishing then refreshes what that same URL serves.
 */
export function updateShare(
  id: number,
  patch: { label?: string; scope?: ShareScope; expiresAt?: string | null }
): ShareLink | null {
  const sets: string[] = []
  const values: (string | null)[] = []
  if (patch.label !== undefined) {
    sets.push('label = ?')
    values.push(patch.label.trim() || 'Shared link')
  }
  if (patch.scope !== undefined) {
    sets.push('scope_json = ?')
    values.push(JSON.stringify(patch.scope))
  }
  if (patch.expiresAt !== undefined) {
    sets.push('expires_at = ?')
    values.push(patch.expiresAt)
  }
  if (!sets.length) return getShare(id)
  getDb()
    .prepare(`UPDATE share_links SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values, id)
  return getShare(id)
}

export function setShareActive(id: number, active: boolean): ShareLink | null {
  getDb().prepare('UPDATE share_links SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
  return getShare(id)
}

export function setShareExpiry(id: number, expiresAt: string | null): ShareLink | null {
  getDb().prepare('UPDATE share_links SET expires_at = ? WHERE id = ?').run(expiresAt, id)
  return getShare(id)
}

export function deleteShare(id: number): void {
  getDb().prepare('DELETE FROM share_links WHERE id = ?').run(id)
}

export function markPublished(id: number): ShareLink | null {
  getDb()
    .prepare("UPDATE share_links SET last_published_at = datetime('now') WHERE id = ?")
    .run(id)
  return getShare(id)
}
