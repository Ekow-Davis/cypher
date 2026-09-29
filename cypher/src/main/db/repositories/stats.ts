import { getDb } from '../index'
import type { StatsBatch, StatsSummary } from '@shared/types'

/**
 * Writing statistics. Windows send increments every half minute; they are
 * added onto hourly rows, so several windows writing at once simply sum.
 */

export function recordStats(batch: StatsBatch): boolean {
  const db = getDb()
  const upsertHour = db.prepare(`
    INSERT INTO stats_hourly (hour, area, scope_id, chars_typed, keystrokes, backspaces,
      words_added, words_deleted, words_pasted, active_seconds, app_seconds)
    VALUES (@hour, @area, @scope_id, @chars_typed, @keystrokes, @backspaces,
      @words_added, @words_deleted, @words_pasted, @active_seconds, @app_seconds)
    ON CONFLICT(hour, area, scope_id) DO UPDATE SET
      chars_typed    = chars_typed    + excluded.chars_typed,
      keystrokes     = keystrokes     + excluded.keystrokes,
      backspaces     = backspaces     + excluded.backspaces,
      words_added    = words_added    + excluded.words_added,
      words_deleted  = words_deleted  + excluded.words_deleted,
      words_pasted   = words_pasted   + excluded.words_pasted,
      active_seconds = active_seconds + excluded.active_seconds,
      app_seconds    = app_seconds    + excluded.app_seconds
  `)
  const insertBurst = db.prepare(`
    INSERT INTO stats_bursts (started_at, seconds, chars, area, scope_id)
    VALUES (@started_at, @seconds, @chars, @area, @scope_id)
  `)
  // Sessions are reported repeatedly while they run; the latest report wins.
  const upsertSession = db.prepare(`
    INSERT INTO stats_sessions (id, started_at, ended_at, active_seconds, words_added, words_deleted)
    VALUES (@id, @started_at, @ended_at, @active_seconds, @words_added, @words_deleted)
    ON CONFLICT(id) DO UPDATE SET
      ended_at = excluded.ended_at,
      active_seconds = excluded.active_seconds,
      words_added = excluded.words_added,
      words_deleted = excluded.words_deleted
  `)

  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
  db.transaction(() => {
    for (const h of batch.hours ?? []) {
      upsertHour.run({
        hour: String(h.hour),
        area: String(h.area),
        scope_id: Math.trunc(num(h.scope_id)),
        chars_typed: Math.trunc(num(h.chars_typed)),
        keystrokes: Math.trunc(num(h.keystrokes)),
        backspaces: Math.trunc(num(h.backspaces)),
        words_added: Math.trunc(num(h.words_added)),
        words_deleted: Math.trunc(num(h.words_deleted)),
        words_pasted: Math.trunc(num(h.words_pasted)),
        active_seconds: num(h.active_seconds),
        app_seconds: num(h.app_seconds)
      })
    }
    for (const b of batch.bursts ?? []) {
      insertBurst.run({
        started_at: String(b.started_at),
        seconds: num(b.seconds),
        chars: Math.trunc(num(b.chars)),
        area: String(b.area),
        scope_id: Math.trunc(num(b.scope_id))
      })
    }
    for (const s of batch.sessions ?? []) {
      upsertSession.run({
        id: String(s.id),
        started_at: String(s.started_at),
        ended_at: String(s.ended_at),
        active_seconds: num(s.active_seconds),
        words_added: Math.trunc(num(s.words_added)),
        words_deleted: Math.trunc(num(s.words_deleted))
      })
    }
  })()
  return true
}

export function statsSummary(): StatsSummary {
  const db = getDb()
  return {
    hours: db.prepare('SELECT * FROM stats_hourly ORDER BY hour ASC').all() as StatsSummary['hours'],
    bursts: db
      .prepare('SELECT started_at, seconds, chars, area, scope_id FROM stats_bursts ORDER BY id DESC LIMIT 20000')
      .all() as StatsSummary['bursts'],
    sessions: db
      .prepare('SELECT * FROM stats_sessions ORDER BY started_at DESC LIMIT 5000')
      .all() as StatsSummary['sessions'],
    // Deleted books still own their history, so names are kept for them too.
    books: db.prepare('SELECT id, title FROM books').all() as StatsSummary['books'],
    documents: db.prepare('SELECT id, title FROM documents').all() as StatsSummary['documents']
  }
}

export function clearStats(): void {
  const db = getDb()
  db.transaction(() => {
    db.exec('DELETE FROM stats_hourly; DELETE FROM stats_bursts; DELETE FROM stats_sessions;')
  })()
}
