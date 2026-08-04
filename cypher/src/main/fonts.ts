import { dialog } from 'electron'
import { join, extname } from 'node:path'
import { mkdirSync, copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { getSetting, setSetting } from './settings'
import { assetsRoot, absoluteAssetPath } from './assets'

const VALID_EXT = new Set(['.ttf', '.otf', '.woff', '.woff2'])
const KEY = 'scriptFont'

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
  // Overwrite any previous font of a different extension so only one is ever active.
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
