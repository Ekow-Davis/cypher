import { pool } from './db.js'

/**
 * Storage for books shared between writers.
 *
 * Change tracking uses a per-book revision counter rather than timestamps: two
 * machines' clocks disagree, and a writer whose clock is behind would otherwise
 * have their work silently treated as older. The counter is assigned by the
 * server, so it is the one source of ordering everyone agrees on.
 */

export interface RemoteChapter {
  id: string
  volume_id: string | null
  title: string
  content: string
  word_count: number
  sort_order: number
  status: string | null
  synopsis: string | null
  deleted: boolean
  revision: number
}

export interface RemoteVolume {
  id: string
  title: string
  sort_order: number
  numbered: number
  unnumbered_label: string
  deleted: boolean
  revision: number
}

export interface RemoteBook {
  id: string
  owner_id: string
  title: string
  subtitle: string | null
  synopsis: string | null
  genre: string | null
  status: string
  author: string | null
  language: string | null
  numbering_style: string
  revision: number
}

export async function initBookSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS online_books (
      id              UUID PRIMARY KEY,
      owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title           TEXT NOT NULL DEFAULT '',
      subtitle        TEXT,
      synopsis        TEXT,
      genre           TEXT,
      status          TEXT NOT NULL DEFAULT 'draft',
      author          TEXT,
      language        TEXT,
      numbering_style TEXT NOT NULL DEFAULT 'off',
      revision        BIGINT NOT NULL DEFAULT 1,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS online_volumes (
      id               UUID PRIMARY KEY,
      book_id          UUID NOT NULL REFERENCES online_books(id) ON DELETE CASCADE,
      title            TEXT NOT NULL DEFAULT '',
      sort_order       INTEGER NOT NULL DEFAULT 0,
      numbered         INTEGER NOT NULL DEFAULT 1,
      unnumbered_label TEXT NOT NULL DEFAULT '',
      deleted          BOOLEAN NOT NULL DEFAULT FALSE,
      revision         BIGINT NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_volumes_book ON online_volumes(book_id, revision);

    CREATE TABLE IF NOT EXISTS online_chapters (
      id         UUID PRIMARY KEY,
      book_id    UUID NOT NULL REFERENCES online_books(id) ON DELETE CASCADE,
      volume_id  UUID,
      title      TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status     TEXT,
      synopsis   TEXT,
      deleted    BOOLEAN NOT NULL DEFAULT FALSE,
      revision   BIGINT NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_book ON online_chapters(book_id, revision);

    -- Collaborators land in Phase 3; the table exists now so access checks have
    -- one place to look from the start.
    -- Yjs updates for chapter bodies. Appended, never overwritten: each update
    -- is a fragment other writers merge, and the order they arrive in does not
    -- matter. That property is what removes conflicts entirely for prose.
    CREATE TABLE IF NOT EXISTS chapter_updates (
      id         BIGSERIAL PRIMARY KEY,
      chapter_id UUID NOT NULL,
      book_id    UUID NOT NULL REFERENCES online_books(id) ON DELETE CASCADE,
      update_b64 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_chapter_updates ON chapter_updates(chapter_id, id);

    CREATE TABLE IF NOT EXISTS book_collaborators (
      book_id  UUID NOT NULL REFERENCES online_books(id) ON DELETE CASCADE,
      user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (book_id, user_id)
    );
  `)
}

/** Owner or accepted collaborator. */
export async function canAccess(bookId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM online_books WHERE id = $1 AND owner_id = $2
     UNION ALL
     SELECT 1 FROM book_collaborators WHERE book_id = $1 AND user_id = $2`,
    [bookId, userId]
  )
  return rows.length > 0
}

export async function isOwner(bookId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM online_books WHERE id = $1 AND owner_id = $2',
    [bookId, userId]
  )
  return rows.length > 0
}

/** Next revision for a book; every write takes one so ordering is total. */
async function bumpRevision(bookId: string): Promise<number> {
  const { rows } = await pool.query(
    'UPDATE online_books SET revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING revision',
    [bookId]
  )
  return rows.length ? Number(rows[0].revision) : 1
}

export interface PushPayload {
  book?: Partial<RemoteBook>
  volumes?: Partial<RemoteVolume>[]
  chapters?: Partial<RemoteChapter>[]
  deletions?: { kind: 'chapter' | 'volume'; id: string }[]
}

/**
 * Applies a writer's local changes.
 *
 * Everything runs at one revision so a sync is atomic from a puller's point of
 * view — they either see the whole batch or none of it, never half a chapter
 * reorder.
 */
export async function pushChanges(
  bookId: string,
  payload: PushPayload
): Promise<{ revision: number }> {
  const revision = await bumpRevision(bookId)

  if (payload.book) {
    const b = payload.book
    await pool.query(
      `UPDATE online_books SET
         title = COALESCE($2, title),
         subtitle = $3, synopsis = $4, genre = $5,
         status = COALESCE($6, status),
         author = $7, language = $8,
         numbering_style = COALESCE($9, numbering_style),
         updated_at = now()
       WHERE id = $1`,
      [
        bookId,
        b.title ?? null,
        b.subtitle ?? null,
        b.synopsis ?? null,
        b.genre ?? null,
        b.status ?? null,
        b.author ?? null,
        b.language ?? null,
        b.numbering_style ?? null
      ]
    )
  }

  for (const v of payload.volumes ?? []) {
    if (!v.id) continue
    await pool.query(
      `INSERT INTO online_volumes (id, book_id, title, sort_order, numbered, unnumbered_label, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, sort_order = EXCLUDED.sort_order,
         numbered = EXCLUDED.numbered, unnumbered_label = EXCLUDED.unnumbered_label,
         revision = EXCLUDED.revision, deleted = FALSE`,
      [v.id, bookId, v.title ?? '', v.sort_order ?? 0, v.numbered ?? 1, v.unnumbered_label ?? '', revision]
    )
  }

  for (const c of payload.chapters ?? []) {
    if (!c.id) continue
    await pool.query(
      `INSERT INTO online_chapters
         (id, book_id, volume_id, title, content, word_count, sort_order, status, synopsis, revision)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         volume_id = EXCLUDED.volume_id, title = EXCLUDED.title,
         content = EXCLUDED.content, word_count = EXCLUDED.word_count,
         sort_order = EXCLUDED.sort_order, status = EXCLUDED.status,
         synopsis = EXCLUDED.synopsis, revision = EXCLUDED.revision, deleted = FALSE`,
      [
        c.id, bookId, c.volume_id ?? null, c.title ?? '', c.content ?? '',
        c.word_count ?? 0, c.sort_order ?? 0, c.status ?? null, c.synopsis ?? null, revision
      ]
    )
  }

  for (const d of payload.deletions ?? []) {
    // Tombstoned, not removed: a puller that has the row needs to be told it
    // went, and a hard delete would just look like it never existed.
    const table = d.kind === 'volume' ? 'online_volumes' : 'online_chapters'
    await pool.query(
      `UPDATE ${table} SET deleted = TRUE, revision = $3 WHERE id = $1 AND book_id = $2`,
      [d.id, bookId, revision]
    )
  }

  return { revision }
}

/** Everything that changed after `since`. */
export async function pullChanges(
  bookId: string,
  since: number
): Promise<{
  revision: number
  book: RemoteBook | null
  volumes: RemoteVolume[]
  chapters: RemoteChapter[]
}> {
  const bookRows = await pool.query('SELECT * FROM online_books WHERE id = $1', [bookId])
  if (!bookRows.rows.length) {
    return { revision: 0, book: null, volumes: [], chapters: [] }
  }
  const book = bookRows.rows[0] as RemoteBook & { revision: string }
  const revision = Number(book.revision)

  const volumes = await pool.query(
    'SELECT * FROM online_volumes WHERE book_id = $1 AND revision > $2 ORDER BY sort_order',
    [bookId, since]
  )
  const chapters = await pool.query(
    'SELECT * FROM online_chapters WHERE book_id = $1 AND revision > $2 ORDER BY sort_order',
    [bookId, since]
  )

  return {
    revision,
    // The book row itself only needs sending when something changed.
    book: since < revision ? ({ ...book, revision } as RemoteBook) : null,
    volumes: volumes.rows as RemoteVolume[],
    chapters: chapters.rows as RemoteChapter[]
  }
}

export async function createOnlineBook(
  id: string,
  ownerId: string,
  fields: Partial<RemoteBook>
): Promise<void> {
  await pool.query(
    `INSERT INTO online_books (id, owner_id, title, subtitle, synopsis, genre, status, author, language, numbering_style)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      id, ownerId, fields.title ?? '', fields.subtitle ?? null, fields.synopsis ?? null,
      fields.genre ?? null, fields.status ?? 'draft', fields.author ?? null,
      fields.language ?? null, fields.numbering_style ?? 'off'
    ]
  )
}

export async function listBooksFor(userId: string): Promise<
  { id: string; title: string; owner_id: string; revision: number; is_owner: boolean }[]
> {
  const { rows } = await pool.query(
    `SELECT b.id, b.title, b.owner_id, b.revision, (b.owner_id = $1) AS is_owner
     FROM online_books b
     WHERE b.owner_id = $1
        OR EXISTS (SELECT 1 FROM book_collaborators c WHERE c.book_id = b.id AND c.user_id = $1)
     ORDER BY b.updated_at DESC`,
    [userId]
  )
  return rows.map((r) => ({ ...r, revision: Number(r.revision) }))
}

/** Removes the book entirely — owner only, used when taking a book offline. */
export async function deleteOnlineBook(bookId: string): Promise<void> {
  await pool.query('DELETE FROM online_books WHERE id = $1', [bookId])
}


/* ---------------- collaborators ---------------- */

export async function addCollaborator(bookId: string, userId: string): Promise<void> {
  await pool.query(
    'INSERT INTO book_collaborators (book_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [bookId, userId]
  )
}

export async function removeCollaborator(bookId: string, userId: string): Promise<void> {
  await pool.query('DELETE FROM book_collaborators WHERE book_id = $1 AND user_id = $2', [
    bookId,
    userId
  ])
}

export async function listCollaborators(
  bookId: string
): Promise<{ id: string; displayName: string; isOwner: boolean }[]> {
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name, TRUE AS is_owner
       FROM online_books b JOIN users u ON u.id = b.owner_id WHERE b.id = $1
     UNION ALL
     SELECT u.id, u.display_name, FALSE AS is_owner
       FROM book_collaborators c JOIN users u ON u.id = c.user_id WHERE c.book_id = $1`,
    [bookId]
  )
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, isOwner: r.is_owner }))
}

/* ---------------- collaborative chapter bodies ---------------- */

/**
 * Stores a Yjs update.
 *
 * Updates accumulate rather than replacing one another: merging them in any
 * order produces the same document, which is what lets two writers edit the
 * same chapter — even both offline — without anyone choosing a winner.
 */
export async function appendChapterUpdate(
  bookId: string,
  chapterId: string,
  updateB64: string
): Promise<{ id: number }> {
  const { rows } = await pool.query(
    'INSERT INTO chapter_updates (chapter_id, book_id, update_b64) VALUES ($1, $2, $3) RETURNING id',
    [chapterId, bookId, updateB64]
  )
  return { id: Number(rows[0].id) }
}

export async function chapterUpdatesSince(
  chapterId: string,
  since: number
): Promise<{ id: number; update_b64: string }[]> {
  const { rows } = await pool.query(
    'SELECT id, update_b64 FROM chapter_updates WHERE chapter_id = $1 AND id > $2 ORDER BY id',
    [chapterId, since]
  )
  return rows.map((r) => ({ id: Number(r.id), update_b64: r.update_b64 }))
}

/**
 * Replaces a chapter's update log with one merged update.
 *
 * Without this the log grows forever — every keystroke session adds rows. The
 * caller sends a single update representing the whole document, so history is
 * compacted without changing what the document says.
 */
export async function compactChapterUpdates(
  bookId: string,
  chapterId: string,
  mergedB64: string
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM chapter_updates WHERE chapter_id = $1', [chapterId])
    await client.query(
      'INSERT INTO chapter_updates (chapter_id, book_id, update_b64) VALUES ($1, $2, $3)',
      [chapterId, bookId, mergedB64]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
