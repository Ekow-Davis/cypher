import { app, dialog, protocol } from 'electron'
import { join, resolve, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { copyFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/**
 * Local asset handling. User-chosen images (book covers now, character images
 * later) are copied into the app-data "assets" folder so the library is fully
 * self-contained and portable. They are served to the renderer through a
 * private custom protocol rather than raw file:// paths.
 *
 *   stored ref (in DB):  "covers/<uuid>.png"
 *   renderer URL:        "cypher-asset://local/covers/<uuid>.png"
 */
const SCHEME = 'cypher-asset'

function assetsRoot(): string {
  return join(app.getPath('userData'), 'assets')
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** Must run BEFORE app is ready. */
export function registerAssetSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** Must run AFTER app is ready. */
export function registerAssetProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const root = resolve(assetsRoot())
    const filePath = resolve(root, rel)
    if (!filePath.startsWith(root)) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const data = await readFile(filePath)
      const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': type } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** Opens a file picker, copies the chosen image into app-data, returns its ref. */
export async function importCover(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose a cover image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const src = result.filePaths[0]
  const dir = join(assetsRoot(), 'covers')
  mkdirSync(dir, { recursive: true })
  const ext = extname(src).toLowerCase() || '.png'
  const name = `${randomUUID()}${ext}`
  copyFileSync(src, join(dir, name))
  return `covers/${name}`
}
