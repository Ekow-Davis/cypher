import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc'
import { initUpdater, checkOnStartup } from './updater'
import { initSpellcheck } from './contextMenu'
import { initDatabase, closeDatabase } from './db'
import { startBackupScheduler, stopBackupScheduler } from './backup'
import { purgeExpiredTrash } from './db/repositories/trash'
import { registerAssetSchemePrivileged, registerAssetProtocol } from './assets'
import { createWindow } from './windows'
import { redirectPortableStorage } from './portable'
import { startSyncScheduler, stopSyncScheduler } from './sync'

// Must run before anything else touches app.getPath('userData') — including
// the scheme registration below, which is why it comes first in the file.
redirectPortableStorage()

// Privileged schemes must be declared before the app is ready.
registerAssetSchemePrivileged()

app.whenReady().then(() => {
  initDatabase()
  registerAssetProtocol()
  registerIpcHandlers()
  initSpellcheck()
  initUpdater()
  startBackupScheduler()
  startSyncScheduler()
  try {
    const purged = purgeExpiredTrash()
    if (purged > 0) console.log(`[trash] purged ${purged} expired item(s)`)
  } catch (e) {
    console.error('[trash] purge failed:', e)
  }
  createWindow('/')
  checkOnStartup()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow('/')
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopBackupScheduler()
  stopSyncScheduler()
  closeDatabase()
})
