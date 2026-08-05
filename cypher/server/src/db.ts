import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's managed Postgres presents a certificate the default CA bundle
  // doesn't cover; the connection is still TLS, just unverified.
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? undefined
    : { rejectUnauthorized: false }
})

/**
 * Creates the schema on boot.
 *
 * The snapshot is stored whole as JSONB rather than normalised into chapters:
 * it is written once per publish, read as a unit, and never queried by its
 * internals — normalising it would add joins and migrations for no gain, and
 * would couple the server to the editor's document model.
 */
export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shares (
      token         TEXT PRIMARY KEY,
      label         TEXT NOT NULL DEFAULT '',
      snapshot      JSONB NOT NULL,
      expires_at    TIMESTAMPTZ,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      views         INTEGER NOT NULL DEFAULT 0,
      read_seconds  BIGINT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

export interface ShareRow {
  token: string
  label: string
  snapshot: unknown
  expires_at: Date | null
  active: boolean
  views: number
  read_seconds: string
}

/** A link is readable only while active and unexpired — checked here, not by the client. */
export function isReadable(row: ShareRow): boolean {
  if (!row.active) return false
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return false
  return true
}
