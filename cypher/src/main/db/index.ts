import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { runMigrations } from './migrations'

type DB = Database.Database

let db: DB | null = null

/** Opens (or creates) the local database and applies any pending migrations. */
export function initDatabase(): DB {
  if (db) return db
  const file = join(app.getPath('userData'), 'cypher.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL') // better concurrency + crash safety
  db.pragma('foreign_keys = ON') // enforce referential integrity
  runMigrations(db)
  console.log('[db] ready at', file)
  return db
}

/** Returns the open connection, throwing if the database is not initialised. */
export function getDb(): DB {
  if (!db) throw new Error('[db] not initialised — call initDatabase() first')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** Lightweight diagnostics surfaced in Settings to confirm storage is live. */
export function getDatabaseInfo(): {
  path: string
  version: number
  tables: number
  tableNames: string[]
} {
  const d = getDb()
  const version = d.pragma('user_version', { simple: true }) as number
  const rows = d
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string }[]
  return {
    path: d.name,
    version,
    tables: rows.length,
    tableNames: rows.map((r) => r.name)
  }
}
