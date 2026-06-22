import type { Database } from 'better-sqlite3'

/**
 * Migration 001 — the full Cypher schema from the specification's data model.
 * Content columns hold plain text today; when diary encryption lands, the same
 * columns hold ciphertext, so no schema change is needed for that step.
 */
export function migration001(db: Database): void {
  db.exec(`
    -- ===== Diary (private) =====
    CREATE TABLE IF NOT EXISTS diaries (
      id          INTEGER PRIMARY KEY,
      name        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS diary_entries (
      id            INTEGER PRIMARY KEY,
      diary_id      INTEGER REFERENCES diaries(id) ON DELETE CASCADE, -- null = standalone
      entry_number  INTEGER,
      title         TEXT,    -- ciphertext (later)
      content       TEXT,    -- ciphertext (later)
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      month_group   TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_diary_entries_diary ON diary_entries(diary_id);

    -- ===== Book (public) =====
    CREATE TABLE IF NOT EXISTS books (
      id          INTEGER PRIMARY KEY,
      title       TEXT    NOT NULL,
      subtitle    TEXT,
      synopsis    TEXT,
      genre       TEXT,
      status      TEXT    NOT NULL DEFAULT 'draft',
      cover_path  TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      archived    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS volumes (
      id          INTEGER PRIMARY KEY,
      book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_volumes_book ON volumes(book_id);

    CREATE TABLE IF NOT EXISTS chapters (
      id          INTEGER PRIMARY KEY,
      book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      volume_id   INTEGER REFERENCES volumes(id) ON DELETE SET NULL,
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL DEFAULT '',
      word_count  INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_book   ON chapters(book_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id);

    CREATE TABLE IF NOT EXISTS chapter_versions (
      id          INTEGER PRIMARY KEY,
      chapter_id  INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      content     TEXT    NOT NULL,
      saved_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter ON chapter_versions(chapter_id);

    CREATE TABLE IF NOT EXISTS characters (
      id          INTEGER PRIMARY KEY,
      book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      folder      TEXT,
      name        TEXT    NOT NULL,
      image_path  TEXT,
      fields_json TEXT    NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_characters_book ON characters(book_id);

    CREATE TABLE IF NOT EXISTS lore_entries (
      id          INTEGER PRIMARY KEY,
      book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lore_book ON lore_entries(book_id);

    -- ===== Document (public) =====
    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY,
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ===== Shared / cross-cutting =====
    CREATE TABLE IF NOT EXISTS notes (
      id          INTEGER PRIMARY KEY,
      owner_type  TEXT    NOT NULL,   -- 'book' | 'diary' | ...
      owner_id    INTEGER NOT NULL,
      slot        INTEGER NOT NULL DEFAULT 0,
      content     TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_type, owner_id);

    CREATE TABLE IF NOT EXISTS goals (
      id            INTEGER PRIMARY KEY,
      owner_type    TEXT    NOT NULL,
      owner_id      INTEGER NOT NULL,
      target_words  INTEGER NOT NULL,
      deadline      TEXT,
      writing_days  TEXT    NOT NULL DEFAULT '[]'  -- JSON array of weekday indices
    );
    CREATE INDEX IF NOT EXISTS idx_goals_owner ON goals(owner_type, owner_id);

    CREATE TABLE IF NOT EXISTS checkins (
      id            INTEGER PRIMARY KEY,
      owner_type    TEXT    NOT NULL,
      owner_id      INTEGER NOT NULL,
      date          TEXT    NOT NULL,
      mood          TEXT,
      note          TEXT,
      words_written INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_checkins_owner ON checkins(owner_type, owner_id);

    CREATE TABLE IF NOT EXISTS share_links (
      id                INTEGER PRIMARY KEY,
      book_id           INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      scope_json        TEXT    NOT NULL,
      password_hash     TEXT,
      expires_at        TEXT,
      active            INTEGER NOT NULL DEFAULT 1,
      last_published_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_share_links_book ON share_links(book_id);

    CREATE TABLE IF NOT EXISTS backups (
      id          INTEGER PRIMARY KEY,
      path        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      type        TEXT    NOT NULL
    );
  `)
}
