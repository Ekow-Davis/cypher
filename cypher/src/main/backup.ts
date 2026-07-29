import { app, dialog, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  existsSync,
  copyFileSync,
  createWriteStream
} from 'node:fs'
import archiver from 'archiver'
import { getDb, closeDatabase, getDatabaseInfo, initDatabase } from './db'
import { getSetting, setSetting } from './settings'
import { assetsRoot } from './assets'
import type { BackupInfo, ArchiveCadence } from '@shared/types'

const CHECK_INTERVAL_MS = 15 * 60 * 1000
const DEFAULT_INTERVAL_HOURS = 24
const DEFAULT_KEEP = 10

export function backupsDir(): string {
  const dir = join(app.getPath('userData'), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(
    d.getMinutes()
  )}-${p(d.getSeconds())}`
}

function infoFor(path: string): BackupInfo {
  const st = statSync(path)
  return {
    name: path.split(/[\\/]/).pop() as string,
    path,
    size: st.size,
    createdAt: st.mtime.toISOString()
  }
}

export function listBackups(): BackupInfo[] {
  try {
    return readdirSync(backupsDir())
      .filter((f) => f.endsWith('.db'))
      .map((f) => infoFor(join(backupsDir(), f)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

/** Trims the archive to the configured retention count, oldest first. */
export function pruneBackups(): void {
  const keep = Math.max(1, Number(getSetting('backupKeep') ?? DEFAULT_KEEP))
  for (const old of listBackups().slice(keep)) {
    try {
      unlinkSync(old.path)
    } catch {
      /* best effort */
    }
  }
}

/**
 * Uses SQLite's own online backup API rather than copying the file. A plain
 * copy of a live database can capture a half-written page or miss committed
 * data still sitting in the WAL; this produces a consistent snapshot.
 */
export async function createBackup(): Promise<BackupInfo> {
  const dest = join(backupsDir(), `cypher-${stamp()}.db`)
  await (getDb() as unknown as { backup: (p: string) => Promise<unknown> }).backup(dest)
  setSetting('lastBackupAt', new Date().toISOString())
  pruneBackups()
  return infoFor(dest)
}

export function deleteBackup(path: string): boolean {
  try {
    if (existsSync(path) && path.startsWith(backupsDir())) {
      unlinkSync(path)
      return true
    }
  } catch {
    /* best effort */
  }
  return false
}

export function revealBackups(): void {
  void shell.openPath(backupsDir())
}

/**
 * Restores a backup over the live database. Takes a safety snapshot first,
 * closes the connection, replaces the file, clears the stale WAL/SHM sidecars,
 * then reopens the database in place and reloads open windows. Reopening beats
 * relaunching: it works identically in dev and packaged builds, and it never
 * leaves the user staring at a dead window.
 */
export async function restoreBackup(path: string): Promise<boolean> {
  if (!existsSync(path)) return false
  const livePath = getDatabaseInfo().path
  try {
    await createBackup()
  } catch {
    /* proceed even if the safety snapshot fails */
  }
  closeDatabase()
  copyFileSync(path, livePath)
  for (const ext of ['-wal', '-shm']) {
    try {
      if (existsSync(livePath + ext)) unlinkSync(livePath + ext)
    } catch {
      /* best effort */
    }
  }
  initDatabase()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.reload()
  }
  return true
}

/** Zips a consistent database snapshot plus all assets to a chosen location. */
export async function exportArchive(): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: 'Export everything',
    defaultPath: `cypher-archive-${stamp()}.zip`,
    filters: [{ name: 'Zip archive', extensions: ['zip'] }]
  })
  if (result.canceled || !result.filePath) return null

  const tmp = join(backupsDir(), `.export-${Date.now()}.db`)
  await (getDb() as unknown as { backup: (p: string) => Promise<unknown> }).backup(tmp)

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(result.filePath as string)
    const zip = archiver('zip', { zlib: { level: 9 } })
    out.on('close', () => resolve())
    out.on('error', reject)
    zip.on('error', reject)
    zip.pipe(out)
    zip.file(tmp, { name: 'cypher.db' })
    const assets = assetsRoot()
    if (existsSync(assets)) zip.directory(assets, 'assets')
    void zip.finalize()
  })

  try {
    unlinkSync(tmp)
  } catch {
    /* best effort */
  }
  setSetting('lastArchiveAt', new Date().toISOString())
  setSetting('archiveSnoozedUntil', null)
  return result.filePath
}

// ---------- reminder ----------
export function archiveDue(): boolean {
  const cadence = (getSetting('archiveReminder') ?? 'monthly') as ArchiveCadence
  if (cadence === 'off') return false
  const snoozed = getSetting('archiveSnoozedUntil') as string | null | undefined
  if (snoozed && Date.now() < new Date(snoozed).getTime()) return false
  const last = getSetting('lastArchiveAt') as string | undefined
  if (!last) return true
  const days = cadence === 'weekly' ? 7 : 30
  return Date.now() - new Date(last).getTime() >= days * 86_400_000
}

export function snoozeArchive(days = 3): void {
  setSetting('archiveSnoozedUntil', new Date(Date.now() + days * 86_400_000).toISOString())
}

// ---------- scheduler ----------
let timer: ReturnType<typeof setInterval> | null = null

async function tick(): Promise<void> {
  if (getSetting('backupEnabled') === false) return
  const hours = Math.max(1, Number(getSetting('backupIntervalHours') ?? DEFAULT_INTERVAL_HOURS))
  const last = getSetting('lastBackupAt') as string | undefined
  const due = !last || Date.now() - new Date(last).getTime() >= hours * 3_600_000
  if (!due) return
  try {
    await createBackup()
    console.log('[backup] automatic backup written')
  } catch (e) {
    console.error('[backup] failed:', e)
  }
}

export function startBackupScheduler(): void {
  void tick()
  timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
}

export function stopBackupScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
