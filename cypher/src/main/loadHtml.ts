import type { BrowserWindow } from 'electron'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/**
 * Loads a generated HTML page into a hidden window for printing or PDF export.
 *
 * Pages used to be passed as a data: URL, but Chromium refuses URLs longer
 * than 2 MB (ERR_INVALID_URL), and a whole book — or anything with a cover or
 * portraits embedded as base64 — passes that easily. Writing the page to a temp
 * file and loading the file has no size limit.
 *
 * Returns a cleanup function that deletes the temp file; call it once the
 * window has finished with the page.
 */
export async function loadHtml(win: BrowserWindow, html: string): Promise<() => void> {
  const dir = join(app.getPath('temp'), 'cypher-render')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.html`)
  writeFileSync(file, html, 'utf8')
  const cleanup = (): void => {
    try {
      rmSync(file, { force: true })
    } catch {
      /* the OS clears temp eventually */
    }
  }
  try {
    await win.loadFile(file)
  } catch (error) {
    cleanup()
    throw error
  }
  return cleanup
}
