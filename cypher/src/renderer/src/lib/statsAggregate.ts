/**
 * Turns raw hourly rows, bursts and sessions into what the stats page shows.
 * Pure functions over plain data, so the numbers can be tested on their own.
 */
import type { StatsSummary, StatsArea } from '@shared/types'

export interface StatsFilter {
  /** Days back from today, or null for all time. */
  days: number | null
  /** Only this book, or null for everything. */
  bookId: number | null
}

export interface DayPoint {
  day: string
  added: number
  deleted: number
  active: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Typing speed in words per minute (5 characters = 1 word, the usual measure). */
export function wpm(chars: number, seconds: number): number {
  return seconds > 0 ? chars / 5 / (seconds / 60) : 0
}

export function aggregate(summary: StatsSummary, filter: StatsFilter) {
  const today = new Date()
  const cutoff = filter.days ? dayKey(addDays(today, -(filter.days - 1))) : null
  const inRange = (day: string): boolean => !cutoff || day >= cutoff
  const inBook = (area: StatsArea, scope: number): boolean =>
    filter.bookId === null || (area === 'book' && scope === filter.bookId)

  const hours = summary.hours.filter((h) => inRange(h.hour.slice(0, 10)) && inBook(h.area, h.scope_id))

  const totals = {
    added: 0,
    deleted: 0,
    pasted: 0,
    chars: 0,
    keystrokes: 0,
    backspaces: 0,
    active: 0,
    app: 0
  }
  const byDay = new Map<string, DayPoint>()
  const byArea = new Map<StatsArea, { app: number; words: number }>()
  const byBook = new Map<number, { added: number; deleted: number; active: number; app: number; chars: number }>()
  const weekHour: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const byHour: number[] = Array(24).fill(0)

  for (const h of hours) {
    totals.added += h.words_added
    totals.deleted += h.words_deleted
    totals.pasted += h.words_pasted
    totals.chars += h.chars_typed
    totals.keystrokes += h.keystrokes
    totals.backspaces += h.backspaces
    totals.active += h.active_seconds
    totals.app += h.app_seconds

    const day = h.hour.slice(0, 10)
    const d = byDay.get(day) ?? { day, added: 0, deleted: 0, active: 0 }
    d.added += h.words_added
    d.deleted += h.words_deleted
    d.active += h.active_seconds
    byDay.set(day, d)

    const a = byArea.get(h.area) ?? { app: 0, words: 0 }
    a.app += h.app_seconds
    a.words += h.words_added
    byArea.set(h.area, a)

    if (h.area === 'book' && h.scope_id) {
      const b = byBook.get(h.scope_id) ?? { added: 0, deleted: 0, active: 0, app: 0, chars: 0 }
      b.added += h.words_added
      b.deleted += h.words_deleted
      b.active += h.active_seconds
      b.app += h.app_seconds
      b.chars += h.chars_typed
      byBook.set(h.scope_id, b)
    }

    const hr = Number(h.hour.slice(11, 13))
    const wd = (parseDay(day).getDay() + 6) % 7 // Monday first
    weekHour[wd][hr] += h.words_added
    byHour[hr] += h.words_added
  }

  // A continuous run of days, gaps included, so the chart's x-axis is honest.
  const firstDay = cutoff ?? [...byDay.keys()].sort()[0] ?? dayKey(today)
  const daily: DayPoint[] = []
  for (let d = parseDay(firstDay); dayKey(d) <= dayKey(today); d = addDays(d, 1)) {
    const k = dayKey(d)
    daily.push(byDay.get(k) ?? { day: k, added: 0, deleted: 0, active: 0 })
    if (daily.length > 3700) break
  }

  const bursts = summary.bursts.filter((b) => inRange(b.started_at.slice(0, 10)) && inBook(b.area, b.scope_id))
  const burstChars = bursts.reduce((s, b) => s + b.chars, 0)
  const burstSeconds = bursts.reduce((s, b) => s + b.seconds, 0)
  const speeds = bursts.filter((b) => b.seconds >= 20).map((b) => wpm(b.chars, b.seconds))

  const sessions = summary.sessions.filter((s) => inRange(s.started_at.slice(0, 10)) && s.active_seconds >= 30)

  // Streaks look at all time: a filter shouldn't break a streak.
  const allDays = new Set(summary.hours.filter((h) => h.words_added > 0).map((h) => h.hour.slice(0, 10)))
  let current = 0
  let cursor = today
  if (!allDays.has(dayKey(cursor))) cursor = addDays(cursor, -1)
  while (allDays.has(dayKey(cursor))) {
    current++
    cursor = addDays(cursor, -1)
  }
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const day of [...allDays].sort()) {
    run = prev && dayKey(addDays(parseDay(prev), 1)) === day ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = day
  }

  const bestDay = [...byDay.values()].sort((a, b) => b.added - a.added)[0] ?? null
  const bestHour = byHour.some((v) => v > 0) ? byHour.indexOf(Math.max(...byHour)) : null

  return {
    totals,
    daily,
    byArea,
    byBook,
    weekHour,
    byHour,
    speed: {
      average: wpm(burstChars, burstSeconds),
      best: speeds.length ? Math.max(...speeds) : 0,
      samples: speeds
    },
    sessions: {
      count: sessions.length,
      lengths: sessions.map((s) => s.active_seconds / 60),
      longest: sessions.reduce<(typeof sessions)[number] | null>(
        (best, s) => (!best || s.active_seconds > best.active_seconds ? s : best),
        null
      )
    },
    streak: { current, longest },
    bestDay,
    bestHour,
    writingDays: [...byDay.values()].filter((d) => d.added > 0).length
  }
}

export type StatsView = ReturnType<typeof aggregate>

/** "2h 14m", "38m", "45s". */
export function duration(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h < 48) return rest ? `${h}h ${rest}m` : `${h}h`
  return `${Math.round(h / 24)}d ${h % 24}h`
}
