import { app, session, shell } from 'electron'

/**
 * App-wide guards that apply to every window Cypher opens, including the
 * hidden print/PDF windows and any added later.
 *
 * Cypher's windows carry the `window.cypher` bridge (the whole database, the
 * file system helpers, the diary). Content in the writing surfaces can come
 * from outside — imported .docx files, EPUBs, pasted links, a collaborator's
 * chapter — so a link must never be able to:
 *   - navigate a window away to a web page, which would then hold the bridge;
 *   - launch an arbitrary protocol handler on the machine (file:, ms-*, smb:,
 *     custom app schemes …) through shell.openExternal;
 *   - embed a <webview>.
 */

/** Schemes that are safe to hand to the operating system. */
const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:'])

/** Opens a link in the user's browser or mail app — and nothing else. */
export function openExternalSafely(rawUrl: string): void {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return
  }
  if (!EXTERNAL_SCHEMES.has(url.protocol)) {
    console.warn('[security] blocked external open of', url.protocol, 'link')
    return
  }
  void shell.openExternal(url.toString())
}

/** True when a navigation stays inside the app's own renderer. */
function isAppUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl && !app.isPackaged) {
    try {
      if (url.origin === new URL(devUrl).origin) return true
    } catch {
      /* fall through */
    }
  }
  // Built app: the renderer is a local file. Only its own index page counts —
  // not any other file on disk.
  return url.protocol === 'file:' && /\/renderer\/index\.html$/.test(url.pathname)
}

/**
 * Permissions no part of Cypher uses. Anything a page asks for from this list
 * is refused; everything else (clipboard writes for "Copy", fullscreen, …)
 * keeps Chromium's default.
 */
const DENIED_PERMISSIONS = new Set([
  'media',
  'geolocation',
  'notifications',
  'midi',
  'midiSysex',
  'pointerLock',
  'openExternal',
  'hid',
  'serial',
  'usb',
  'display-capture',
  'idle-detection',
  'speaker-selection',
  'window-management',
  'keyboardLock'
])

/** Call once, before the first window is created. */
export function installSecurityGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Links clicked inside a page: stay in the app, or go to the browser.
    contents.on('will-navigate', (event, url) => {
      if (isAppUrl(url)) return
      event.preventDefault()
      openExternalSafely(url)
    })
    contents.on('will-redirect', (event, url) => {
      if (isAppUrl(url)) return
      event.preventDefault()
    })
    // window.open / target="_blank": never a new Electron window.
    contents.setWindowOpenHandler(({ url }) => {
      openExternalSafely(url)
      return { action: 'deny' }
    })
    // Cypher never uses <webview>; refuse any attempt to attach one.
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(!DENIED_PERMISSIONS.has(permission))
    })
  })
}
