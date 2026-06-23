import type { Database } from 'better-sqlite3'
import { migration001, migration002 } from './schema'

interface Migration {
  version: number
  up: (db: Database) => void
}

/**
 * Ordered list of migrations. To evolve the schema later, append a new entry
 * with the next version number and its `up` function. Each runs once, in order,
 * inside a transaction, and the database's user_version is bumped to match.
 */
const MIGRATIONS: Migration[] = [
  { version: 1, up: migration001 },
  { version: 2, up: migration002 }
]

export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version
  )

  for (const migration of pending) {
    const tx = db.transaction(() => {
      migration.up(db)
      db.pragma(`user_version = ${migration.version}`)
    })
    tx()
    console.log(`[db] applied migration ${migration.version}`)
  }
}
