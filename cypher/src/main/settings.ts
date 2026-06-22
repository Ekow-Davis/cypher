import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

/**
 * Lightweight persistent settings, stored as JSON in the app's userData
 * directory. This is the real settings layer (like VS Code's settings.json);
 * the SQLite database added later is for journal and book *content*, not app
 * preferences. The renderer reaches these only through the secure bridge.
 */
function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: Record<string, unknown> | null = null

function load(): Record<string, unknown> {
  if (cache) return cache
  try {
    const p = settingsPath()
    cache = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>) : {}
  } catch (error) {
    console.error('[settings] read failed:', error)
    cache = {}
  }
  return cache
}

function persist(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(settingsPath(), JSON.stringify(cache ?? {}, null, 2), 'utf8')
  } catch (error) {
    console.error('[settings] write failed:', error)
  }
}

export function getSetting(key: string): unknown {
  return load()[key] ?? null
}

export function getAllSettings(): Record<string, unknown> {
  return { ...load() }
}

export function setSetting(key: string, value: unknown): boolean {
  const store = load()
  store[key] = value
  persist()
  return true
}
