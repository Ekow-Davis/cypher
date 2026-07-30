import { dialog } from 'electron'
import { join, extname, basename } from 'node:path'
import { copyFileSync, mkdirSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { assetsRoot } from './assets'
import type { ReaderFormat } from '@shared/types'

export interface ImportedFile {
  relPath: string
  sourcePath: string
  format: ReaderFormat
  title: string
}

/** Opens a picker, copies the chosen EPUB/PDF into app storage, returns its refs. */
export async function importReaderFile(): Promise<ImportedFile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Add a book to your library',
    properties: ['openFile'],
    filters: [
      { name: 'E-books', extensions: ['epub', 'pdf'] },
      { name: 'EPUB', extensions: ['epub'] },
      { name: 'PDF', extensions: ['pdf'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const src = result.filePaths[0]
  const ext = extname(src).toLowerCase()
  const format: ReaderFormat = ext === '.pdf' ? 'pdf' : 'epub'
  const dir = join(assetsRoot(), 'reader')
  mkdirSync(dir, { recursive: true })
  const name = `${randomUUID()}${ext}`
  copyFileSync(src, join(dir, name))
  return { relPath: `reader/${name}`, sourcePath: src, format, title: basename(src, ext) }
}

/** Opens a picker for a cover image, copies it into app storage, returns its ref. */
export async function importReaderCover(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose a cover image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const src = result.filePaths[0]
  const dir = join(assetsRoot(), 'reader-covers')
  mkdirSync(dir, { recursive: true })
  const ext = extname(src).toLowerCase() || '.png'
  const name = `${randomUUID()}${ext}`
  copyFileSync(src, join(dir, name))
  return `reader-covers/${name}`
}

/** Writes cover bytes we extracted ourselves into app storage. */
export function saveCoverBytes(data: Buffer, ext: string): string {
  const dir = join(assetsRoot(), 'reader-covers')
  mkdirSync(dir, { recursive: true })
  const safeExt = /^\.[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : '.png'
  const name = `${randomUUID()}${safeExt}`
  writeFileSync(join(dir, name), data)
  return `reader-covers/${name}`
}

/** Deletes the user's original source file (after they confirm). */
export function deleteSourceFile(path: string): boolean {
  try {
    if (existsSync(path)) {
      unlinkSync(path)
      return true
    }
  } catch {
    /* best effort */
  }
  return false
}

/** Removes copied assets (the book file and its cover) when an item is deleted. */
export function deleteReaderAssets(rels: Array<string | null | undefined>): void {
  for (const rel of rels) {
    if (!rel) continue
    try {
      const p = join(assetsRoot(), rel)
      if (existsSync(p)) unlinkSync(p)
    } catch {
      /* best effort */
    }
  }
}
