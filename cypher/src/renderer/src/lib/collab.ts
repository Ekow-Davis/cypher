import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror'
import type { Schema } from '@tiptap/pm/model'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Collaborative editing for chapters in an online book.
 *
 * Each chapter gets a Y.Doc whose updates are exchanged with the server rather
 * than whole documents being overwritten. Updates merge in any order and
 * produce the same result, so two writers editing the same chapter — including
 * both while offline — converge without anyone choosing a winner. That is the
 * whole reason for the indirection: a last-write-wins body would silently
 * discard whichever writer saved second.
 */

const FRAGMENT = 'body'

export interface CollabSession {
  doc: Y.Doc
  fragment: Y.XmlFragment
  /** Highest server update id already merged in. */
  lastId: number
  destroy: () => void
}

const sessions = new Map<string, CollabSession>()

export function sessionFor(chapterRemoteId: string): CollabSession | null {
  return sessions.get(chapterRemoteId) ?? null
}

/**
 * Seeds a fresh document from the chapter's stored JSON.
 *
 * Only used when the server has no updates yet — seeding a document that
 * already has history would duplicate all of its content.
 */
function seed(doc: Y.Doc, schema: Schema, json: unknown): void {
  if (!json) return
  try {
    prosemirrorJSONToYXmlFragment(schema, json as any, doc.getXmlFragment(FRAGMENT))
  } catch {
    /* malformed stored content — start empty rather than crash the editor */
  }
}

export interface OpenOptions {
  chapterRemoteId: string
  bookRemoteId: string
  schema: Schema
  /** The chapter's stored JSON, used only if the server has nothing. */
  fallbackJson: unknown
  /**
   * The document the editor is already bound to.
   *
   * Collaboration binds at editor construction, before the server has
   * answered — so the caller creates the document and passes it in rather than
   * receiving a different one here that nothing would be watching.
   */
  doc: Y.Doc
}

export async function openSession(options: OpenOptions): Promise<CollabSession> {
  const existing = sessions.get(options.chapterRemoteId)
  if (existing) return existing

  const doc = options.doc
  const fragment = doc.getXmlFragment(FRAGMENT)
  const session: CollabSession = {
    doc,
    fragment,
    lastId: 0,
    destroy: () => {
      // The document belongs to the editor, which destroys it on unmount.
      sessions.delete(options.chapterRemoteId)
    }
  }
  sessions.set(options.chapterRemoteId, session)

  const updates = await fetchUpdates(options.bookRemoteId, options.chapterRemoteId, 0)
  if (updates.length) {
    // Applying inside a transaction keeps the editor from re-rendering once
    // per update while a long history replays.
    doc.transact(() => {
      for (const update of updates) {
        Y.applyUpdate(doc, base64ToBytes(update.update_b64))
      }
    })
    session.lastId = updates[updates.length - 1].id
  } else {
    seed(doc, options.schema, options.fallbackJson)
    // Publish the seed so the next writer to open this chapter inherits it
    // rather than seeding a second, competing copy.
    await pushUpdate(
      options.bookRemoteId,
      options.chapterRemoteId,
      bytesToBase64(Y.encodeStateAsUpdate(doc))
    )
  }

  return session
}

async function api(path: string, init?: RequestInit): Promise<Response | null> {
  const config = await window.cypher.collab.config()
  if (!config?.baseUrl || !config.token) return null
  return fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${config.token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {})
    }
  })
}

export async function fetchUpdates(
  bookRemoteId: string,
  chapterRemoteId: string,
  since: number
): Promise<{ id: number; update_b64: string }[]> {
  try {
    const response = await api(
      `/api/books/${bookRemoteId}/chapters/${chapterRemoteId}/updates?since=${since}`
    )
    if (!response?.ok) return []
    const data = (await response.json()) as { updates: { id: number; update_b64: string }[] }
    return data.updates ?? []
  } catch {
    // Offline: the local document keeps working and catches up later.
    return []
  }
}

export async function pushUpdate(
  bookRemoteId: string,
  chapterRemoteId: string,
  updateB64: string,
  compact = false
): Promise<boolean> {
  try {
    const response = await api(
      `/api/books/${bookRemoteId}/chapters/${chapterRemoteId}/updates`,
      { method: 'POST', body: JSON.stringify({ update: updateB64, compact }) }
    )
    return !!response?.ok
  } catch {
    return false
  }
}

/**
 * Exchanges changes with the server.
 *
 * Sends only what the server hasn't seen, using its state vector — pushing the
 * whole document every time would grow the log without bound.
 */
export async function syncSession(
  session: CollabSession,
  bookRemoteId: string,
  chapterRemoteId: string
): Promise<boolean> {
  const remote = await fetchUpdates(bookRemoteId, chapterRemoteId, session.lastId)
  if (remote.length) {
    session.doc.transact(() => {
      for (const update of remote) Y.applyUpdate(session.doc, base64ToBytes(update.update_b64))
    })
    session.lastId = remote[remote.length - 1].id
  }

  // Anything local that the server hasn't got yet.
  const pending = Y.encodeStateAsUpdate(session.doc)
  return pushUpdate(bookRemoteId, chapterRemoteId, bytesToBase64(pending))
}

/**
 * Collapses a chapter's update history into one update.
 *
 * The log grows with every writing session; without this it would be replayed
 * in full every time the chapter is opened.
 */
export async function compact(
  session: CollabSession,
  bookRemoteId: string,
  chapterRemoteId: string
): Promise<void> {
  const merged = bytesToBase64(Y.encodeStateAsUpdate(session.doc))
  const ok = await pushUpdate(bookRemoteId, chapterRemoteId, merged, true)
  if (ok) session.lastId = 0
}

/**
 * The document as ProseMirror JSON, for saving a readable copy locally.
 *
 * The fragment carries its own node names, so no schema is needed here — the
 * local copy exists so the chapter still opens if the book is ever taken
 * offline, and so exports have something to read.
 */
export function toJSON(session: CollabSession): unknown {
  try {
    return yXmlFragmentToProsemirrorJSON(session.fragment as any)
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function closeAll(): void {
  for (const session of sessions.values()) session.destroy()
  sessions.clear()
}
