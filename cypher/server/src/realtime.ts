import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { pool } from './db.js'

/**
 * Live collaboration over WebSockets.
 *
 * Polling was enough to keep documents in step, but not to show where someone
 * else's cursor is — by the time a six-second poll lands, the caret has moved.
 * This relays updates as they happen and carries presence alongside them.
 *
 * The server holds each chapter's document in memory while anyone is editing.
 * That is what lets a writer who joins late receive the current state
 * immediately rather than replaying the whole update log.
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

/** Written back to Postgres on a timer rather than per keystroke. */
const PERSIST_DEBOUNCE_MS = 4000
/** Rooms are dropped once empty so memory tracks actual use. */
const EMPTY_ROOM_GRACE_MS = 30_000

interface Room {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  connections: Set<WSLike>
  bookId: string
  chapterId: string
  persistTimer: ReturnType<typeof setTimeout> | null
  emptyTimer: ReturnType<typeof setTimeout> | null
  dirty: boolean
}

export interface WSLike {
  send: (data: Uint8Array) => void
  close: () => void
  readyState: number
}

const rooms = new Map<string, Room>()

function key(bookId: string, chapterId: string): string {
  return `${bookId}:${chapterId}`
}

async function loadDoc(chapterId: string, doc: Y.Doc): Promise<void> {
  const { rows } = await pool.query(
    'SELECT update_b64 FROM chapter_updates WHERE chapter_id = $1 ORDER BY id',
    [chapterId]
  )
  if (!rows.length) return
  doc.transact(() => {
    for (const row of rows) {
      try {
        Y.applyUpdate(doc, Buffer.from(row.update_b64, 'base64'))
      } catch {
        /* a corrupt row shouldn't stop the rest loading */
      }
    }
  })
}

/**
 * Replaces the update log with the document's current state.
 *
 * Compacting on write keeps the log from growing without bound — otherwise
 * every session's keystrokes accumulate and opening a long chapter gets slower
 * forever.
 */
async function persist(room: Room): Promise<void> {
  if (!room.dirty) return
  room.dirty = false
  const merged = Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString('base64')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM chapter_updates WHERE chapter_id = $1', [room.chapterId])
    await client.query(
      'INSERT INTO chapter_updates (chapter_id, book_id, update_b64) VALUES ($1, $2, $3)',
      [room.chapterId, room.bookId, merged]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[realtime] persist failed:', error)
  } finally {
    client.release()
  }
}

function schedulePersist(room: Room): void {
  room.dirty = true
  if (room.persistTimer) return
  room.persistTimer = setTimeout(() => {
    room.persistTimer = null
    void persist(room)
  }, PERSIST_DEBOUNCE_MS)
}

async function getRoom(bookId: string, chapterId: string): Promise<Room> {
  const id = key(bookId, chapterId)
  const existing = rooms.get(id)
  if (existing) {
    if (existing.emptyTimer) {
      clearTimeout(existing.emptyTimer)
      existing.emptyTimer = null
    }
    return existing
  }

  const doc = new Y.Doc()
  await loadDoc(chapterId, doc)
  const room: Room = {
    doc,
    awareness: new awarenessProtocol.Awareness(doc),
    connections: new Set(),
    bookId,
    chapterId,
    persistTimer: null,
    emptyTimer: null,
    dirty: false
  }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    // Fan out to everyone except whoever sent it.
    const message = encoding.createEncoder()
    encoding.writeVarUint(message, MESSAGE_SYNC)
    syncProtocol.writeUpdate(message, update)
    const payload = encoding.toUint8Array(message)
    for (const connection of room.connections) {
      if (connection !== origin && connection.readyState === 1) connection.send(payload)
    }
    schedulePersist(room)
  })

  room.awareness.on(
    'update',
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = added.concat(updated, removed)
      const message = encoding.createEncoder()
      encoding.writeVarUint(message, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(
        message,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed)
      )
      const payload = encoding.toUint8Array(message)
      for (const connection of room.connections) {
        if (connection !== origin && connection.readyState === 1) connection.send(payload)
      }
    }
  )

  rooms.set(id, room)
  return room
}

export async function handleConnection(
  socket: WSLike,
  bookId: string,
  chapterId: string,
  onMessage: (handler: (data: Uint8Array) => void) => void,
  onClose: (handler: () => void) => void
): Promise<void> {
  const room = await getRoom(bookId, chapterId)
  room.connections.add(socket)

  // Both sides announce what they have. Sending only ours would leave a
  // client that joins an existing chapter with an empty document: its reply
  // describes what *it* holds, which for a new joiner is nothing.
  const sync = encoding.createEncoder()
  encoding.writeVarUint(sync, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(sync, room.doc)
  socket.send(encoding.toUint8Array(sync))

  // Send whoever is already here, so a joiner sees existing cursors at once.
  const states = room.awareness.getStates()
  if (states.size) {
    const message = encoding.createEncoder()
    encoding.writeVarUint(message, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      message,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()])
    )
    socket.send(encoding.toUint8Array(message))
  }

  onMessage((data: Uint8Array) => {
    try {
      const decoder = decoding.createDecoder(data)
      const type = decoding.readVarUint(decoder)
      if (type === MESSAGE_SYNC) {
        const reply = encoding.createEncoder()
        encoding.writeVarUint(reply, MESSAGE_SYNC)
        syncProtocol.readSyncMessage(decoder, reply, room.doc, socket)
        if (encoding.length(reply) > 1) socket.send(encoding.toUint8Array(reply))
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          socket
        )
      }
    } catch (error) {
      console.error('[realtime] bad message:', error)
    }
  })

  onClose(() => {
    room.connections.delete(socket)
    // Clear this writer's cursor so it doesn't linger for everyone else.
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [...room.awareness.getStates().keys()].filter(
        (client) => room.awareness.meta.get(client)?.clock === undefined
      ),
      socket
    )

    if (room.connections.size === 0) {
      // Held briefly: a reload shouldn't force the document to reload from
      // Postgres, but an empty room shouldn't sit in memory forever either.
      room.emptyTimer = setTimeout(() => {
        void persist(room).then(() => {
          room.doc.destroy()
          rooms.delete(key(bookId, chapterId))
        })
      }, EMPTY_ROOM_GRACE_MS)
    }
  })
}

/** Flushes every room; called when the server is shutting down. */
export async function flushAll(): Promise<void> {
  await Promise.all([...rooms.values()].map((room) => persist(room)))
}
