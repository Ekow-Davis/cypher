import { shell, BrowserWindow } from 'electron'
import { join } from 'node:path'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

/** Hard ceiling so a stray click can't spawn windows without end. */
export const MAX_WINDOWS = 5

export interface OpenResult {
  ok: boolean
  reason?: string
  count: number
}

/**
 * webContents ids of windows opened as secondary views. A secondary window's
 * "back" affordance should close it rather than navigate, since the thing that
 * spawned it is still open in the window behind.
 */
const secondaryWindows = new Set<number>()

export function isSecondaryWindow(webContentsId: number): boolean {
  return secondaryWindows.has(webContentsId)
}

export function closeWindowFor(webContentsId: number): boolean {
  const win = liveWindows().find((w) => w.webContents.id === webContentsId)
  if (!win) return false
  win.close()
  return true
}

function liveWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
}

export function windowCount(): number {
  return liveWindows().length
}

/**
 * Opens a window pointed at a hash route. Because the renderer uses hash
 * history, a second window can boot straight into `/book/3?tab=lore` without
 * any extra navigation step.
 */
export function createWindow(route = '/'): BrowserWindow | null {
  if (windowCount() >= MAX_WINDOWS) return null

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    // Low enough to snap to half of a 1280-wide screen; the renderer
    // switches its side panels to overlays below ~900px.
    minWidth: 620,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#15121d',
    title: 'Cypher',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const hash = route.startsWith('/') ? route : `/${route}`
  if (isDev) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }

  return window
}

export function openWindow(route: string): OpenResult {
  const win = createWindow(route)
  if (win) {
    const id = win.webContents.id
    secondaryWindows.add(id)
    win.on('closed', () => secondaryWindows.delete(id))
  }
  if (!win) {
    return {
      ok: false,
      reason: `You can have at most ${MAX_WINDOWS} windows open.`,
      count: windowCount()
    }
  }
  return { ok: true, count: windowCount() }
}

/**
 * Tells other windows that a slice of data changed so they can re-read it.
 * The originating window is skipped — it already applied the change locally,
 * and re-reading there would fight whatever the user is typing.
 */
export function broadcastDataChanged(scope: string, exceptWebContentsId?: number): void {
  for (const win of liveWindows()) {
    if (win.webContents.id === exceptWebContentsId) continue
    win.webContents.send('data:changed', scope)
  }
}
