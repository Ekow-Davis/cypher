import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'

/**
 * Update checking, backed by GitHub Releases.
 *
 * Windows NSIS builds ship a .blockmap alongside the installer, which lets the
 * updater download only the blocks that actually changed — a small patch
 * instead of the whole 130MB installer. Nothing installs without the user
 * agreeing: downloads are explicit, and the restart is theirs to trigger.
 */

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; notes: string | null }
  | { status: 'downloading'; percent: number; transferred: number; total: number }
  | { status: 'ready'; version: string }
  | { status: 'none' }
  | { status: 'error'; message: string }

let state: UpdateState = { status: 'idle' }

function broadcast(next: UpdateState): void {
  state = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:state', next)
  }
}

export function currentUpdateState(): UpdateState {
  return state
}

export function initUpdater(): void {
  // Downloading silently would burn a user's data without asking; the renderer
  // decides when, after showing what is coming.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({
      status: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null
    })
  )
  autoUpdater.on('update-not-available', () => broadcast({ status: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({
      status: 'downloading',
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total
    })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ status: 'ready', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    broadcast({ status: 'error', message: err?.message ?? String(err) })
  )

  ipcMain.handle('update:check', async () => {
    // A dev build has no installer to patch, and asking GitHub would only
    // produce a confusing error. app.isPackaged is Electron's own signal, so
    // this needs no extra dependency.
    if (!app.isPackaged) {
      broadcast({ status: 'none' })
      return state
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      broadcast({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
    return state
  })

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      broadcast({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
    return state
  })

  ipcMain.handle('update:install', () => {
    // Quits and relaunches into the new version.
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('update:state', () => state)
}

/** A quiet check shortly after launch, so updates surface without being asked for. */
export function checkOnStartup(): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      /* offline is not an error worth reporting */
    })
  }, 8000)
}
