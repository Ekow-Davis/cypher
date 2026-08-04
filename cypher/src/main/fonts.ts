import { dialog } from 'electron'
import { join, extname } from 'node:path'
import { mkdirSync, copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { getSetting, setSetting } from './settings'
import { assetsRoot, absoluteAssetPath } from './assets'

const VALID_EXT = new Set(['.ttf', '.otf', '.woff', '.woff2'])
const KEY = 'scriptFont'
const LIBRARY_KEY = 'fontLibrary'

export interface ScriptFont {
  fileName: string
  /** relative asset ref, e.g. "fonts/Cypher.ttf" */
  path: string
  format: string
}

const FORMAT_BY_EXT: Record<string, string> = {
  '.ttf': 'truetype',
  '.otf': 'opentype',
  '.woff': 'woff',
  '.woff2': 'woff2'
}

/**
 * Lets the real handwriting font be installed whenever it's ready, without a
 * code change or app update — the diary was built against a swappable
 * `--font-script` variable from day one specifically so this drop-in works.
 */
export async function importScriptFont(): Promise<ScriptFont | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose your script font',
    properties: ['openFile'],
    filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const src = result.filePaths[0]
  const ext = extname(src).toLowerCase()
  if (!VALID_EXT.has(ext)) return null

  const dir = join(assetsRoot(), 'fonts')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `script${ext}`)
  // Overwrite any previous script font of a different extension so only one is
  // ever active. Library fonts use uuid-style names, so they can't collide.
  for (const e of VALID_EXT) {
    const stale = join(dir, `script${e}`)
    if (existsSync(stale)) unlinkSync(stale)
  }
  copyFileSync(src, dest)

  const font: ScriptFont = {
    fileName: src.split(/[\\/]/).pop() ?? 'font',
    path: `fonts/script${ext}`,
    format: FORMAT_BY_EXT[ext]
  }
  setSetting(KEY, font)
  return font
}

export function getScriptFont(): ScriptFont | null {
  const stored = getSetting(KEY) as ScriptFont | null | undefined
  if (!stored || !existsSync(absoluteAssetPath(stored.path))) return null
  return stored
}

export function clearScriptFont(): void {
  const stored = getSetting(KEY) as ScriptFont | null | undefined
  if (stored) {
    try {
      unlinkSync(absoluteAssetPath(stored.path))
    } catch {
      /* best effort */
    }
  }
  setSetting(KEY, null)
}


export interface LibraryFont {
  id: string
  /** CSS family name, derived from the file name and made unique. */
  family: string
  fileName: string
  path: string
  format: string
}

/**
 * A library of user-supplied fonts usable anywhere in the app.
 *
 * Separate from the diary's script font: that one is a single swappable slot
 * tied to the "translation" concept, whereas these are ordinary typefaces the
 * user adds because the app ships with very few. Both live under assets/ and
 * are served by the same protocol.
 */
export function listLibraryFonts(): LibraryFont[] {
  const stored = (getSetting(LIBRARY_KEY) as LibraryFont[] | null | undefined) ?? []
  // Drop entries whose file has gone missing rather than emitting broken @font-face rules.
  return stored.filter((f) => existsSync(absoluteAssetPath(f.path)))
}

function uniqueFamily(base: string, taken: Set<string>): string {
  const clean = base.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'Custom Font'
  if (!taken.has(clean)) return clean
  let n = 2
  while (taken.has(`${clean} ${n}`)) n++
  return `${clean} ${n}`
}

export async function importLibraryFont(): Promise<LibraryFont | null> {
  const result = await dialog.showOpenDialog({
    title: 'Add a font',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const dir = join(assetsRoot(), 'fonts')
  mkdirSync(dir, { recursive: true })

  const library = listLibraryFonts()
  const taken = new Set(library.map((f) => f.family))
  let last: LibraryFont | null = null

  for (const src of result.filePaths) {
    const ext = extname(src).toLowerCase()
    if (!VALID_EXT.has(ext)) continue
    const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const dest = join(dir, `${id}${ext}`)
    copyFileSync(src, dest)

    const baseName = (src.split(/[\\/]/).pop() ?? 'font').replace(/\.[^.]+$/, '')
    const family = uniqueFamily(baseName.replace(/[-_]+/g, ' '), taken)
    taken.add(family)

    last = {
      id,
      family,
      fileName: src.split(/[\\/]/).pop() ?? 'font',
      path: `fonts/${id}${ext}`,
      format: FORMAT_BY_EXT[ext]
    }
    library.push(last)
  }

  setSetting(LIBRARY_KEY, library)
  return last
}

export function removeLibraryFont(id: string): void {
  const library = listLibraryFonts()
  const target = library.find((f) => f.id === id)
  if (target) {
    try {
      unlinkSync(absoluteAssetPath(target.path))
    } catch {
      /* best effort */
    }
  }
  setSetting(
    LIBRARY_KEY,
    library.filter((f) => f.id !== id)
  )
}

export function renameLibraryFont(id: string, family: string): LibraryFont | null {
  const library = listLibraryFonts()
  const taken = new Set(library.filter((f) => f.id !== id).map((f) => f.family))
  const target = library.find((f) => f.id === id)
  if (!target) return null
  target.family = uniqueFamily(family, taken)
  setSetting(LIBRARY_KEY, library)
  return target
}
