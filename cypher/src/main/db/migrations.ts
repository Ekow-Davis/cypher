import type { Database } from 'better-sqlite3'
import {
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015
} from './schema'

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
  { version: 2, up: migration002 },
  { version: 3, up: migration003 },
  { version: 4, up: migration004 },
  { version: 5, up: migration005 },
  { version: 6, up: migration006 },
  { version: 7, up: migration007 },
  { version: 8, up: migration008 },
  { version: 9, up: migration009 },
  { version: 10, up: migration010 },
  { version: 11, up: migration011 },
  { version: 12, up: migration012 },
  { version: 13, up: migration013 },
  { version: 14, up: migration014 },
  { version: 15, up: migration015 }
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
