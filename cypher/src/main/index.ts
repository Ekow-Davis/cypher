import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './db'
import { registerAssetSchemePrivileged, registerAssetProtocol } from './assets'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// Privileged schemes must be declared before the app is ready.
registerAssetSchemePrivileged()

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
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

  if (isDev) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  initDatabase()
  registerAssetProtocol()
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDatabase()
})
