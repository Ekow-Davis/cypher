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

/**
 * Migration 002 — daily progress tracking.
 * Adds a per-day total-words snapshot to checkins (so we can derive words
 * written each day), plus a uniqueness guarantee on (owner, date) that lets
 * the progress + mood writers upsert a single row per day.
 */
export function migration002(db: Database): void {
  db.exec(`
    ALTER TABLE checkins ADD COLUMN total_words INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE checkins ADD COLUMN day_start_words INTEGER; -- baseline at first snapshot of the day
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_owner_date
      ON checkins(owner_type, owner_id, date);
  `)
}

/**
 * Migration 003 — per-day deletions counter.
 * Tracks words removed each day separately from words written, so an editing
 * day shows both "+written" and "-deleted" without the two cancelling out.
 */
export function migration003(db: Database): void {
  db.exec(`ALTER TABLE checkins ADD COLUMN words_deleted INTEGER NOT NULL DEFAULT 0;`)
}

/**
 * Migration 004 — lore categories.
 * Adds a category to lore entries so the codex can be grouped (Locations,
 * Factions, History, Magic, …) in the sidebar.
 */
export function migration004(db: Database): void {
  db.exec(`ALTER TABLE lore_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'General';`)
}

/**
 * Migration 005 — the reader library.
 * Imported EPUB/PDF books are copied into app storage; this table tracks them,
 * their cover, the original source path (for reference), and resume position.
 */
export function migration005(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reader_items (
      id            INTEGER PRIMARY KEY,
      title         TEXT    NOT NULL,
      author        TEXT,
      format        TEXT    NOT NULL,            -- 'epub' | 'pdf'
      file_path     TEXT    NOT NULL,            -- relative under assets/, e.g. 'reader/<uuid>.epub'
      cover_path    TEXT,                        -- relative under assets/, nullable
      source_path   TEXT,                        -- original absolute path at import time
      last_location TEXT,                        -- resume position (epub CFI / pdf page)
      added_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

/**
 * Migration 006 — pinned notes get a title and a colour, so the sticky notes
 * beside the editor can be labelled and colour-coded at a glance.
 */
export function migration006(db: Database): void {
  db.exec(`
    ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT '';
    ALTER TABLE notes ADD COLUMN color TEXT;
  `)
}

/**
 * Migration 007 — trash. Content tables gain a deleted_at stamp so removing a
 * chapter, entry, character, or book hides it and can be undone, instead of
 * destroying it the instant the button is clicked.
 */
export function migration007(db: Database): void {
  db.exec(`
    ALTER TABLE books ADD COLUMN deleted_at TEXT;
    ALTER TABLE chapters ADD COLUMN deleted_at TEXT;
    ALTER TABLE lore_entries ADD COLUMN deleted_at TEXT;
    ALTER TABLE characters ADD COLUMN deleted_at TEXT;
  `)
}

/**
 * Migration 008 — chapter metadata: a synopsis, a revision status, and an
 * optional POV character. POV is a real reference, so renaming a character
 * keeps the link and deleting one clears it rather than orphaning an id.
 */
export function migration008(db: Database): void {
  db.exec(`
    ALTER TABLE chapters ADD COLUMN synopsis TEXT NOT NULL DEFAULT '';
    ALTER TABLE chapters ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
    ALTER TABLE chapters ADD COLUMN pov_character_id INTEGER
      REFERENCES characters(id) ON DELETE SET NULL;
  `)
}
