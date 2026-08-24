import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/**
 * Redirects storage to sit beside the exe when running as a portable build.
 *
 * Without this, the portable build silently uses the same %APPDATA%\cypher
 * folder as the installed version — so both would share one database, and
 * deleting the portable exe would leave the data behind rather than taking it
 * along. Neither matches what "portable" is supposed to mean, so this makes
 * the portable build genuinely self-contained: everything it writes lives in
 * a `data` folder next to Cypher-portable.exe, and moving or deleting that
 * one folder is the whole of moving or deleting the app.
 *
 * Must run before any other main-process module reads app.getPath('userData').
 */
export function redirectPortableStorage(): void {
  // electron-builder's portable target sets this when running the self-
  // extracting exe; it is absent for the installed (NSIS) build.
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (!exeDir) return

  const dataDir = join(exeDir, 'Cypher Data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  app.setPath('userData', dataDir)
  app.setPath('sessionData', join(dataDir, 'Session'))
}

/** Whether this process is the portable build, for anything that wants to say so. */
export function isPortable(): boolean {
  return !!process.env.PORTABLE_EXECUTABLE_DIR
}
