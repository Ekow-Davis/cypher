import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Live connection to a chapter's editing room.
 *
 * Deliberately small rather than pulling in y-websocket: that package assumes
 * a browser origin and its own server, while this needs a token in the URL and
 * Cypher's own auth. The protocol is the standard Yjs sync/awareness pair, so
 * the server side is conventional even though the transport is ours.
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

/** Backoff so a server restart doesn't turn into a reconnect storm. */
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 20_000

export type ConnectionState = 'connecting' | 'live' | 'offline'

export interface CollabConnection {
  awareness: Awareness
  state: () => ConnectionState
  onState: (cb: (state: ConnectionState) => void) => void
  destroy: () => void
}

export interface ConnectOptions {
  baseUrl: string
  token: string
  bookRemoteId: string
  chapterRemoteId: string
  doc: Y.Doc
  /**
   * Created by the caller so the caret extension can bind to it when the
   * editor is built — before this connection exists.
   */
  awareness: Awareness
  /** Shown beside this writer's caret. */
  user: { name: string; color: string }
}

export function connectChapter(options: ConnectOptions): CollabConnection {
  const awareness = options.awareness
  awareness.setLocalStateField('user', options.user)

  let socket: WebSocket | null = null
  let closed = false
  let attempts = 0
  let state: ConnectionState = 'connecting'
  const listeners = new Set<(s: ConnectionState) => void>()

  function setState(next: ConnectionState): void {
    if (state === next) return
    state = next
    for (const listener of listeners) listener(next)
  }

  const wsUrl = options.baseUrl.replace(/^http/, 'ws')
  const url =
    `${wsUrl}/ws/books/${options.bookRemoteId}/chapters/${options.chapterRemoteId}` +
    `?token=${encodeURIComponent(options.token)}`

  function send(payload: Uint8Array): void {
    if (socket?.readyState === WebSocket.OPEN) socket.send(payload)
  }

  function onDocUpdate(update: Uint8Array, origin: unknown): void {
    // Updates that arrived from the socket must not be echoed back.
    if (origin === 'remote') return
    const message = encoding.createEncoder()
    encoding.writeVarUint(message, MESSAGE_SYNC)
    syncProtocol.writeUpdate(message, update)
    send(encoding.toUint8Array(message))
  }

  function onAwarenessUpdate(
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ): void {
    if (origin === 'remote') return
    const message = encoding.createEncoder()
    encoding.writeVarUint(message, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      message,
      encodeAwarenessUpdate(awareness, added.concat(updated, removed))
    )
    send(encoding.toUint8Array(message))
  }

  options.doc.on('update', onDocUpdate)
  awareness.on('update', onAwarenessUpdate)

  function connect(): void {
    if (closed) return
    setState(attempts === 0 ? 'connecting' : state)
    socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      attempts = 0
      setState('live')
      // Offer our state so the server can send back only what we're missing.
      const message = encoding.createEncoder()
      encoding.writeVarUint(message, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(message, options.doc)
      send(encoding.toUint8Array(message))

      // Re-announce presence: the server has no memory of us across a drop.
      const presence = encoding.createEncoder()
      encoding.writeVarUint(presence, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(
        presence,
        encodeAwarenessUpdate(awareness, [options.doc.clientID])
      )
      send(encoding.toUint8Array(presence))
    }

    socket.onmessage = (event: MessageEvent) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer))
        const type = decoding.readVarUint(decoder)
        if (type === MESSAGE_SYNC) {
          // readSyncMessage writes the correct answer into `reply`: a step2
          // when the peer asked what we have, or nothing for a plain update.
          // Both sides must send their own step1 — answering only the other
          // side's leaves whoever joined second with an empty document.
          const reply = encoding.createEncoder()
          encoding.writeVarUint(reply, MESSAGE_SYNC)
          syncProtocol.readSyncMessage(decoder, reply, options.doc, 'remote')
          if (encoding.length(reply) > 1) send(encoding.toUint8Array(reply))
        } else if (type === MESSAGE_AWARENESS) {
          applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), 'remote')
        }
      } catch {
        /* a malformed frame shouldn't take the connection down */
      }
    }

    socket.onclose = () => {
      setState('offline')
      if (closed) return
      attempts += 1
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempts - 1), RECONNECT_MAX_MS)
      setTimeout(connect, delay)
    }

    socket.onerror = () => socket?.close()
  }

  connect()

  return {
    awareness,
    state: () => state,
    onState: (cb) => {
      listeners.add(cb)
      cb(state)
    },
    destroy: () => {
      closed = true
      options.doc.off('update', onDocUpdate)
      awareness.off('update', onAwarenessUpdate)
      // Clear our caret for everyone else before going.
      removeAwarenessStates(awareness, [options.doc.clientID], 'local')
      socket?.close()
    }
  }
}

/** A stable colour per writer, so the same person keeps the same caret colour. */
export function colorFor(id: string): string {
  const palette = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#fb7185', '#22d3ee']
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}
