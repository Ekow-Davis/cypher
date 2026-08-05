import { writeFileSync } from 'node:fs'
import { dialog } from 'electron'
import { buildSnapshot } from './snapshot'
import { renderReaderHtml } from '@shared/readerHtml'
import { getShare, markPublished, setShareActive } from '../db/repositories/shares'
import { getSetting } from '../settings'
import type { ShareScope } from '@shared/types'

function safeName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Shared book'
}

export interface ShareExportResult {
  path: string | null
  chapters: number
  cancelled?: boolean
  error?: string
}

/**
 * Writes a share as a standalone HTML file — readable in any browser with no
 * server involved. This is the same snapshot and the same reader the hosted
 * link will serve, so what a reader sees offline matches what they'd see online.
 */
export async function exportShareFile(shareId: number): Promise<ShareExportResult> {
  const share = getShare(shareId)
  if (!share) return { path: null, chapters: 0, error: 'Share link not found.' }

  let scope: ShareScope
  try {
    scope = JSON.parse(share.scope_json) as ShareScope
  } catch {
    return { path: null, chapters: 0, error: 'This link has a damaged scope.' }
  }

  const snapshot = buildSnapshot(share.book_id, scope)
  if (!snapshot) return { path: null, chapters: 0, error: 'Book not found.' }
  if (!snapshot.chapters.length) {
    return { path: null, chapters: 0, error: 'No chapters selected to share.' }
  }

  const picked = await dialog.showSaveDialog({
    title: 'Save shareable page',
    defaultPath: `${safeName(snapshot.title)}.html`,
    filters: [{ name: 'Web page', extensions: ['html'] }]
  })
  if (picked.canceled || !picked.filePath) return { path: null, chapters: 0, cancelled: true }

  try {
    writeFileSync(picked.filePath, renderReaderHtml(snapshot), 'utf8')
    markPublished(shareId)
    return { path: picked.filePath, chapters: snapshot.chapters.length }
  } catch (e) {
    return { path: null, chapters: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Chapter count a scope would include, for the dialog's live summary. */
export function previewShareSize(bookId: number, scope: ShareScope): number {
  return buildSnapshot(bookId, scope)?.chapters.length ?? 0
}


export interface ServerConfig {
  baseUrl: string
  publishKey: string
}

function serverConfig(): ServerConfig | null {
  const baseUrl = String(getSetting('shareServerUrl') ?? '').trim().replace(/\/+$/, '')
  const publishKey = String(getSetting('sharePublishKey') ?? '').trim()
  if (!baseUrl || !publishKey) return null
  return { baseUrl, publishKey }
}

export interface PublishResult {
  ok: boolean
  url?: string
  error?: string
}

function scopeOf(json: string): ShareScope | null {
  try {
    return JSON.parse(json) as ShareScope
  } catch {
    return null
  }
}

/**
 * Pushes the current state of the book to the server under this link's
 * existing token — which is what makes "update" work: readers keep the URL
 * they already have and simply see the newer text.
 */
export async function publishShare(shareId: number): Promise<PublishResult> {
  const config = serverConfig()
  if (!config) {
    return { ok: false, error: 'Set your share server URL and publish key in Settings → Data.' }
  }
  const share = getShare(shareId)
  if (!share?.token) return { ok: false, error: 'Share link not found.' }

  const scope = scopeOf(share.scope_json)
  if (!scope) return { ok: false, error: 'This link has a damaged scope.' }

  const snapshot = buildSnapshot(share.book_id, scope)
  if (!snapshot) return { ok: false, error: 'Book not found.' }
  if (!snapshot.chapters.length) return { ok: false, error: 'No chapters selected to share.' }

  try {
    const response = await fetch(`${config.baseUrl}/api/shares/${share.token}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.publishKey}`
      },
      body: JSON.stringify({
        label: share.label,
        snapshot,
        expiresAt: share.expires_at,
        active: share.active === 1
      })
    })
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401
            ? 'The publish key was rejected. Check it in Settings → Data.'
            : `Server returned ${response.status}.`
      }
    }
    markPublished(shareId)
    return { ok: true, url: `${config.baseUrl}/s/${share.token}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Revokes online as well as locally, so the URL stops serving immediately. */
export async function unpublishShare(shareId: number): Promise<PublishResult> {
  const config = serverConfig()
  const share = getShare(shareId)
  if (!share?.token) return { ok: false, error: 'Share link not found.' }
  setShareActive(shareId, false)
  if (!config) return { ok: true }

  try {
    await fetch(`${config.baseUrl}/api/shares/${share.token}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.publishKey}` }
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface ShareStats {
  views: number
  readSeconds: number
  active: boolean
}

export async function fetchShareStats(shareId: number): Promise<ShareStats | null> {
  const config = serverConfig()
  const share = getShare(shareId)
  if (!config || !share?.token) return null
  try {
    const response = await fetch(`${config.baseUrl}/api/shares/${share.token}/stats`, {
      headers: { Authorization: `Bearer ${config.publishKey}` }
    })
    if (!response.ok) return null
    return (await response.json()) as ShareStats
  } catch {
    return null
  }
}

/** The public URL for a link, if a server is configured. */
export function shareUrl(shareId: number): string | null {
  const config = serverConfig()
  const share = getShare(shareId)
  if (!config || !share?.token) return null
  return `${config.baseUrl}/s/${share.token}`
}
