import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { getDb } from './db'
import { getSetting } from './settings'
import { readToken, onlineEnabled } from './account'

/**
 * Keeps an online book in step with the server.
 *
 * Push first, then pull. Local edits are marked dirty as they happen, so a
 * dropped connection simply means they stay marked and go up on the next
 * attempt — the writer never has to know the network went away. Deletions are
 * queued separately because a removed row has nowhere to carry a flag.
 */

const SYNC_INTERVAL_MS = 20_000

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced'; at: string }
  | { state: 'offline'; pending: number }
  | { state: 'error'; message: string }

const statuses = new Map<number, SyncStatus>()
let timer: ReturnType<typeof setInterval> | null = null

function broadcast(bookId: number, status: SyncStatus): void {
  statuses.set(bookId, status)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('sync:status', { bookId, status })
  }
}

export function syncStatus(bookId: number): SyncStatus {
  return statuses.get(bookId) ?? { state: 'idle' }
}

function serverUrl(): string {
  return String(getSetting('shareServerUrl') ?? '')
    .trim()
    .replace(/\/+$/, '')
}

interface BookRow {
  id: number
  remote_id: string | null
  online: number
  revision: number
  title: string
  subtitle: string | null
  synopsis: string | null
  genre: string | null
  status: string
  author: string | null
  language: string | null
  numbering_style: string
  dirty: number
}

/** Rows needing a remote id get one now, so a first sync has something to send. */
function ensureRemoteIds(bookId: number): void {
  const db = getDb()
  db.prepare("UPDATE chapters SET remote_id = lower(hex(randomblob(16))) WHERE book_id = ? AND remote_id IS NULL")
    .run(bookId)
  db.prepare("UPDATE volumes SET remote_id = lower(hex(randomblob(16))) WHERE book_id = ? AND remote_id IS NULL")
    .run(bookId)
}

/** Formats SQLite's hex blob as a UUID, which is what the server's columns expect. */
function asUuid(hex: string): string {
  if (hex.includes('-')) return hex
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function pendingCount(bookId: number): number {
  const db = getDb()
  const chapters = db
    .prepare('SELECT COUNT(*) AS n FROM chapters WHERE book_id = ? AND dirty = 1')
    .get(bookId) as { n: number }
  const volumes = db
    .prepare('SELECT COUNT(*) AS n FROM volumes WHERE book_id = ? AND dirty = 1')
    .get(bookId) as { n: number }
  const deletions = db
    .prepare('SELECT COUNT(*) AS n FROM sync_deletions WHERE book_id = ?')
    .get(bookId) as { n: number }
  const book = db.prepare('SELECT dirty FROM books WHERE id = ?').get(bookId) as { dirty: number }
  return chapters.n + volumes.n + deletions.n + (book?.dirty ?? 0)
}

export async function syncBook(bookId: number): Promise<SyncStatus> {
  const db = getDb()
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as BookRow | undefined
  if (!book?.online || !book.remote_id) return { state: 'idle' }

  const token = readToken()
  const base = serverUrl()
  if (!onlineEnabled() || !token || !base) {
    const status: SyncStatus = { state: 'offline', pending: pendingCount(bookId) }
    broadcast(bookId, status)
    return status
  }

  broadcast(bookId, { state: 'syncing' })
  ensureRemoteIds(bookId)

  try {
    // ---- push ----
    const dirtyChapters = db
      .prepare('SELECT * FROM chapters WHERE book_id = ? AND dirty = 1')
      .all(bookId) as Record<string, unknown>[]
    const dirtyVolumes = db
      .prepare('SELECT * FROM volumes WHERE book_id = ? AND dirty = 1')
      .all(bookId) as Record<string, unknown>[]
    const deletions = db
      .prepare('SELECT * FROM sync_deletions WHERE book_id = ?')
      .all(bookId) as { id: number; kind: string; remote_id: string }[]

    const volumeRemote = new Map<number, string>()
    for (const v of db.prepare('SELECT id, remote_id FROM volumes WHERE book_id = ?').all(bookId) as {
      id: number
      remote_id: string | null
    }[]) {
      if (v.remote_id) volumeRemote.set(v.id, asUuid(v.remote_id))
    }

    const payload = {
      book: book.dirty
        ? {
            title: book.title,
            subtitle: book.subtitle,
            synopsis: book.synopsis,
            genre: book.genre,
            status: book.status,
            author: book.author,
            language: book.language,
            numbering_style: book.numbering_style
          }
        : undefined,
      volumes: dirtyVolumes.map((v) => ({
        id: asUuid(String(v.remote_id)),
        title: String(v.title ?? ''),
        sort_order: Number(v.sort_order ?? 0),
        numbered: Number(v.numbered ?? 1),
        unnumbered_label: String(v.unnumbered_label ?? '')
      })),
      chapters: dirtyChapters.map((c) => ({
        id: asUuid(String(c.remote_id)),
        volume_id: c.volume_id ? (volumeRemote.get(Number(c.volume_id)) ?? null) : null,
        title: String(c.title ?? ''),
        content: String(c.content ?? ''),
        word_count: Number(c.word_count ?? 0),
        sort_order: Number(c.sort_order ?? 0),
        status: (c.status as string) ?? null,
        synopsis: (c.synopsis as string) ?? null
      })),
      deletions: deletions.map((d) => ({
        kind: d.kind as 'chapter' | 'volume',
        id: asUuid(d.remote_id)
      }))
    }

    const hasChanges =
      payload.book || payload.volumes.length || payload.chapters.length || payload.deletions.length

    if (hasChanges) {
      const response = await fetch(`${base}/api/books/${asUuid(book.remote_id)}/changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      if (!response.ok) throw new Error(`Push failed (${response.status})`)

      // Only cleared once the server has confirmed: clearing optimistically
      // would drop the writer's work if the request had actually failed.
      const clear = db.transaction(() => {
        db.prepare('UPDATE chapters SET dirty = 0 WHERE book_id = ? AND dirty = 1').run(bookId)
        db.prepare('UPDATE volumes SET dirty = 0 WHERE book_id = ? AND dirty = 1').run(bookId)
        db.prepare('UPDATE books SET dirty = 0 WHERE id = ?').run(bookId)
        db.prepare('DELETE FROM sync_deletions WHERE book_id = ?').run(bookId)
      })
      clear()
    }

    // ---- pull ----
    const pullResponse = await fetch(
      `${base}/api/books/${asUuid(book.remote_id)}/changes?since=${book.revision}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!pullResponse.ok) throw new Error(`Pull failed (${pullResponse.status})`)
    const remote = (await pullResponse.json()) as {
      revision: number
      book: Record<string, unknown> | null
      volumes: Record<string, unknown>[]
      chapters: Record<string, unknown>[]
    }

    applyRemote(bookId, remote)

    const at = new Date().toISOString()
    db.prepare('UPDATE books SET revision = ?, last_synced_at = ? WHERE id = ?').run(
      remote.revision,
      at,
      bookId
    )
    const status: SyncStatus = { state: 'synced', at }
    broadcast(bookId, status)
    return status
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // A network failure is not an error the writer needs to act on — their work
    // is safe locally and will go up when the connection returns.
    const offline = /fetch|network|ENOTFOUND|ECONN|timeout/i.test(message)
    const status: SyncStatus = offline
      ? { state: 'offline', pending: pendingCount(bookId) }
      : { state: 'error', message }
    broadcast(bookId, status)
    return status
  }
}

/** Writes the server's version of changed rows into the local database. */
function applyRemote(
  bookId: number,
  remote: {
    book: Record<string, unknown> | null
    volumes: Record<string, unknown>[]
    chapters: Record<string, unknown>[]
  }
): void {
  const db = getDb()
  const run = db.transaction(() => {
    if (remote.book) {
      db.prepare(
        `UPDATE books SET title = ?, subtitle = ?, synopsis = ?, genre = ?, status = ?,
           author = ?, language = ?, numbering_style = ? WHERE id = ?`
      ).run(
        remote.book.title ?? '',
        remote.book.subtitle ?? null,
        remote.book.synopsis ?? null,
        remote.book.genre ?? null,
        remote.book.status ?? 'draft',
        remote.book.author ?? null,
        remote.book.language ?? null,
        remote.book.numbering_style ?? 'off',
        bookId
      )
    }

    for (const v of remote.volumes) {
      const remoteId = String(v.id)
      const existing = db
        .prepare('SELECT id FROM volumes WHERE remote_id = ?')
        .get(remoteId.replace(/-/g, '')) as { id: number } | undefined
      if (v.deleted) {
        if (existing) db.prepare('DELETE FROM volumes WHERE id = ?').run(existing.id)
        continue
      }
      if (existing) {
        db.prepare(
          'UPDATE volumes SET title = ?, sort_order = ?, numbered = ?, unnumbered_label = ?, dirty = 0 WHERE id = ?'
        ).run(v.title ?? '', v.sort_order ?? 0, v.numbered ?? 1, v.unnumbered_label ?? '', existing.id)
      } else {
        db.prepare(
          'INSERT INTO volumes (book_id, title, sort_order, numbered, unnumbered_label, remote_id, dirty) VALUES (?,?,?,?,?,?,0)'
        ).run(bookId, v.title ?? '', v.sort_order ?? 0, v.numbered ?? 1, v.unnumbered_label ?? '', remoteId.replace(/-/g, ''))
      }
    }

    for (const c of remote.chapters) {
      const remoteId = String(c.id).replace(/-/g, '')
      const existing = db.prepare('SELECT id FROM chapters WHERE remote_id = ?').get(remoteId) as
        | { id: number }
        | undefined
      if (c.deleted) {
        if (existing) db.prepare('DELETE FROM chapters WHERE id = ?').run(existing.id)
        continue
      }
      const volumeLocal = c.volume_id
        ? (
            db
              .prepare('SELECT id FROM volumes WHERE remote_id = ?')
              .get(String(c.volume_id).replace(/-/g, '')) as { id: number } | undefined
          )?.id ?? null
        : null

      if (existing) {
        db.prepare(
          `UPDATE chapters SET volume_id = ?, title = ?, content = ?, word_count = ?,
             sort_order = ?, status = ?, synopsis = ?, dirty = 0 WHERE id = ?`
        ).run(
          volumeLocal, c.title ?? '', c.content ?? '', c.word_count ?? 0,
          c.sort_order ?? 0, c.status ?? null, c.synopsis ?? null, existing.id
        )
      } else {
        db.prepare(
          `INSERT INTO chapters (book_id, volume_id, title, content, word_count, sort_order, status, synopsis, remote_id, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,0)`
        ).run(
          bookId, volumeLocal, c.title ?? '', c.content ?? '', c.word_count ?? 0,
          c.sort_order ?? 0, c.status ?? null, c.synopsis ?? null, remoteId
        )
      }
    }
  })
  run()
}

/** Syncs every online book; called on a timer and after edits settle. */
export async function syncAll(): Promise<void> {
  const db = getDb()
  const books = db
    .prepare('SELECT id FROM books WHERE online = 1 AND deleted_at IS NULL')
    .all() as { id: number }[]
  for (const book of books) await syncBook(book.id)
}

export function startSyncScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    if (onlineEnabled()) void syncAll()
  }, SYNC_INTERVAL_MS)
}

export function stopSyncScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/** Marks a row for the next push. Called by the repositories on every write. */
export function markDirty(kind: 'book' | 'chapter' | 'volume', id: number): void {
  const table = kind === 'book' ? 'books' : kind === 'chapter' ? 'chapters' : 'volumes'
  try {
    getDb().prepare(`UPDATE ${table} SET dirty = 1 WHERE id = ?`).run(id)
  } catch {
    /* the column is absent until migration 019 has run */
  }
}

/** Records a deletion so it can be pushed after the row is gone. */
export function queueDeletion(kind: 'chapter' | 'volume', bookId: number, remoteId: string): void {
  if (!remoteId) return
  try {
    getDb()
      .prepare('INSERT INTO sync_deletions (book_id, kind, remote_id) VALUES (?, ?, ?)')
      .run(bookId, kind, remoteId)
  } catch {
    /* not an online book, or pre-migration */
  }
}

export { randomUUID }
