/**
 * Writing statistics, collected in the window and flushed to the database.
 *
 * Only numbers are kept — how many words went in and came out, how long you
 * typed, how fast — never any text. Nothing is recorded until the writer turns
 * statistics on in Settings.
 *
 * How words are counted: for every edit, the text around the change is
 * widened to whole words and counted before and after. Typing "h", "e", "l"…
 * adds one word on the first letter and nothing after; backspacing a word away
 * removes one on its last letter; typing a space inside "helloworld" adds one.
 * Gains are words written, losses words deleted — so the numbers mean what a
 * writer would expect, not keystrokes in disguise.
 */
import type { Router } from 'vue-router'
import { usePreferencesStore } from '@/stores/preferences'
import type { StatsArea, StatsBatch, StatsHourRow, StatsBurst, StatsSession } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu
const WORD_CHAR = /[\p{L}\p{N}'’\-]/u

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0
}

/** Local-time keys, so "3am" means 3am where the writer is. */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function hourKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}`
}
function stamp(d = new Date()): string {
  return `${hourKey(d)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Word gain and loss between two versions of a string, looking only at the
 * changed stretch widened to whole words.
 */
export function wordDelta(before: string, after: string): { added: number; removed: number } {
  if (before === after) return { added: 0, removed: 0 }
  let start = 0
  const max = Math.min(before.length, after.length)
  while (start < max && before[start] === after[start]) start++
  let endB = before.length
  let endA = after.length
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--
    endA--
  }
  // Widen to word edges, identically on both sides (the shared prefix and
  // suffix are the same text).
  let s = start
  while (s > 0 && WORD_CHAR.test(before[s - 1]) && start - s < 120) s--
  let eb = endB
  let ea = endA
  while (eb < before.length && WORD_CHAR.test(before[eb]) && eb - endB < 120) {
    eb++
    ea++
  }
  const diff = countWords(after.slice(s, ea)) - countWords(before.slice(s, eb))
  return diff >= 0 ? { added: diff, removed: 0 } : { added: 0, removed: -diff }
}

// ---------------------------------------------------------------------------

type Row = Omit<StatsHourRow, 'hour' | 'area' | 'scope_id'>

const rows = new Map<string, StatsHourRow>()
const bursts: StatsBurst[] = []

let router: Router | null = null
let lastUserInput = 0
let lastPaste = 0
let lastType = 0
let lastActivity = Date.now()
let lastTick = Date.now()

let burst: { start: number; last: number; chars: number; area: StatsArea; scope: number } | null = null
let session: (StatsSession & { lastAt: number }) | null = null

function enabled(): boolean {
  try {
    return usePreferencesStore().statsEnabled
  } catch {
    return false
  }
}

function where(): { area: StatsArea; scope: number } {
  const route = router?.currentRoute.value
  if (!route) return { area: 'other', scope: 0 }
  const name = String(route.name ?? '')
  const id = Number(route.params?.id)
  const scope = Number.isFinite(id) ? id : 0
  if (name.startsWith('reader')) return { area: 'reader', scope: name === 'reader-item' ? scope : 0 }
  const domain = route.meta?.themeDomain
  if (domain === 'book') return { area: 'book', scope: name === 'book-workspace' || name === 'book-settings' ? scope : 0 }
  if (domain === 'document') return { area: 'document', scope: name === 'document-editor' ? scope : 0 }
  if (domain === 'diary') return { area: 'diary', scope: 0 }
  return { area: 'other', scope: 0 }
}

/** Where we are, or null when this place shouldn't be counted at all. */
function countedWhere(): { area: StatsArea; scope: number } | null {
  if (!enabled()) return null
  const w = where()
  if (w.area === 'diary' && !usePreferencesStore().statsIncludeDiary) return null
  return w
}

function row(area: StatsArea, scope: number): Row {
  const hour = hourKey()
  const key = `${hour}|${area}|${scope}`
  let r = rows.get(key)
  if (!r) {
    r = {
      hour,
      area,
      scope_id: scope,
      chars_typed: 0,
      keystrokes: 0,
      backspaces: 0,
      words_added: 0,
      words_deleted: 0,
      words_pasted: 0,
      active_seconds: 0,
      app_seconds: 0
    }
    rows.set(key, r)
  }
  return r
}

function isEditable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  if (node instanceof HTMLTextAreaElement) return true
  return !!node.closest?.('[contenteditable="true"], .ProseMirror')
}

/** Typing time: gaps up to 30s count as writing (thinking is writing). */
function noteTyping(w: { area: StatsArea; scope: number }, chars: number): void {
  const now = Date.now()
  const gap = now - lastType
  if (lastType && gap <= 30_000) row(w.area, w.scope).active_seconds += gap / 1000
  lastType = now

  // A burst is uninterrupted typing (pauses under 5s) — the basis for speed.
  if (!burst || now - burst.last > 5000 || burst.area !== w.area || burst.scope !== w.scope) {
    closeBurst()
    burst = { start: now, last: now, chars: 0, area: w.area, scope: w.scope }
  }
  burst.last = now
  burst.chars += chars

  // A session is a sitting: activity with no break longer than ten minutes.
  if (!session || now - session.lastAt > 10 * 60_000) {
    session = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      started_at: stamp(),
      ended_at: stamp(),
      active_seconds: 0,
      words_added: 0,
      words_deleted: 0,
      lastAt: now
    }
  } else if (gap <= 30_000) {
    session.active_seconds += gap / 1000
  }
  session.lastAt = now
  session.ended_at = stamp()
}

function closeBurst(): void {
  if (!burst) return
  const seconds = (burst.last - burst.start) / 1000
  // Short flurries say little about speed; keep sustained typing only.
  if (seconds >= 15 && burst.chars >= 40) {
    bursts.push({
      started_at: stamp(new Date(burst.start)),
      seconds,
      chars: burst.chars,
      area: burst.area,
      scope_id: burst.scope
    })
  }
  burst = null
}

function addWords(added: number, removed: number, pasted: boolean): void {
  const w = countedWhere()
  if (!w || (!added && !removed)) return
  const r = row(w.area, w.scope)
  if (pasted) r.words_pasted += added
  else r.words_added += added
  r.words_deleted += removed
  if (session && !pasted) {
    session.words_added += added
    session.words_deleted += removed
  }
}

// ---------- editors ----------

const watched = new WeakSet<object>()

/** Counts words changed by a ProseMirror transaction the writer caused. */
function onTransaction({ transaction: tr }: { transaction: any }): void {
  if (!tr.docChanged || !enabled()) return
  // Collaborators' edits arrive as transactions too; they aren't yours.
  if (tr.getMeta('y-sync$')) return
  const now = Date.now()
  const uiEvent = tr.getMeta('uiEvent')
  const pasted = uiEvent === 'paste' || uiEvent === 'drop' || now - lastPaste < 400
  // Loading a chapter, a library pull or a find-and-replace isn't typing.
  if (!pasted && now - lastUserInput > 400) return

  let added = 0
  let removed = 0
  tr.steps.forEach((step: any, i: number) => {
    if (typeof step.from !== 'number' || typeof step.to !== 'number' || !step.slice) return
    const before = tr.docs[i]
    // Replacing the whole document is a load, whatever triggered it.
    if (step.from === 0 && step.to === before.content.size) return
    const after = i + 1 < tr.docs.length ? tr.docs[i + 1] : tr.doc
    const lo = Math.max(0, step.from - 120)
    const hiBefore = Math.min(before.content.size, step.to + 120)
    const map = step.getMap()
    const hiAfter = Math.min(after.content.size, map.map(hiBefore))
    const d = wordDelta(
      before.textBetween(lo, hiBefore, '\n', ' '),
      after.textBetween(lo, hiAfter, '\n', ' ')
    )
    added += d.added
    removed += d.removed
  })
  addWords(added, removed, pasted)
}

function watchEditorIn(target: EventTarget | null): void {
  const pm = (target as HTMLElement | null)?.closest?.('.ProseMirror') as (HTMLElement & { editor?: any }) | null
  const editor = pm?.editor
  if (!editor || watched.has(editor)) return
  watched.add(editor)
  editor.on('transaction', onTransaction)
}

const lastValues = new WeakMap<HTMLTextAreaElement, string>()

// ---------- flushing ----------

async function flush(): Promise<void> {
  if (burst && Date.now() - burst.last > 5000) closeBurst()
  const hours = [...rows.values()].filter(
    (r) =>
      r.chars_typed || r.keystrokes || r.words_added || r.words_deleted || r.words_pasted || r.active_seconds || r.app_seconds
  )
  const batch: StatsBatch = {
    hours,
    bursts: bursts.splice(0),
    sessions: session ? [{ ...session }] : []
  }
  rows.clear()
  if (session) delete (batch.sessions[0] as Partial<typeof session>).lastAt
  if (!batch.hours.length && !batch.bursts.length && !batch.sessions.length) return
  try {
    await window.cypher.stats.record(batch)
  } catch {
    /* a lost half-minute of statistics is not worth an error */
  }
}

// ---------- install ----------

let installed = false

export function installStatsTracker(r: Router): void {
  if (installed) return
  installed = true
  router = r

  window.addEventListener(
    'keydown',
    (e) => {
      lastActivity = Date.now()
      if (!e.isTrusted || !isEditable(e.target)) return
      if (['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock'].includes(e.key)) return
      lastUserInput = Date.now()
      const w = countedWhere()
      if (!w) return
      watchEditorIn(e.target)
      const r0 = row(w.area, w.scope)
      r0.keystrokes++
      if (e.key === 'Backspace' || e.key === 'Delete') {
        r0.backspaces++
        noteTyping(w, 0)
      }
    },
    true
  )

  window.addEventListener(
    'beforeinput',
    (e: InputEvent) => {
      if (!e.isTrusted || !isEditable(e.target)) return
      lastUserInput = Date.now()
      if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') lastPaste = Date.now()
      const w = countedWhere()
      if (!w) return
      watchEditorIn(e.target)
      if (e.target instanceof HTMLTextAreaElement && !lastValues.has(e.target)) {
        lastValues.set(e.target, e.target.value)
      }
      if ((e.inputType === 'insertText' || e.inputType === 'insertCompositionText') && e.data) {
        const chars = [...e.data].length
        row(w.area, w.scope).chars_typed += chars
        noteTyping(w, chars)
      } else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        noteTyping(w, 1)
      }
    },
    true
  )

  window.addEventListener('paste', () => (lastPaste = Date.now()), true)
  window.addEventListener('cut', () => (lastUserInput = Date.now()), true)
  window.addEventListener('focusin', (e) => watchEditorIn(e.target), true)

  // Plain text boxes (the diary, notes, synopses) are diffed on each input.
  window.addEventListener(
    'input',
    (e) => {
      const el = e.target
      if (!(el instanceof HTMLTextAreaElement) || !e.isTrusted) return
      const before = lastValues.get(el) ?? el.value
      lastValues.set(el, el.value)
      if (!countedWhere()) return
      const d = wordDelta(before, el.value)
      addWords(d.added, d.removed, (e as InputEvent).inputType === 'insertFromPaste')
    },
    true
  )
  window.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLTextAreaElement) lastValues.set(e.target, e.target.value)
  })

  // Presence: time with Cypher focused and someone actually there.
  const bump = (): void => {
    lastActivity = Date.now()
  }
  window.addEventListener('mousemove', bump, { passive: true })
  window.addEventListener('wheel', bump, { passive: true })
  window.addEventListener('pointerdown', bump, { passive: true })

  setInterval(() => {
    const now = Date.now()
    const elapsed = Math.min(15, (now - lastTick) / 1000)
    lastTick = now
    const w = countedWhere()
    if (!w) return
    const present =
      document.visibilityState === 'visible' && document.hasFocus() && now - lastActivity < 5 * 60_000
    if (present) row(w.area, w.scope).app_seconds += elapsed
  }, 10_000)

  setInterval(() => void flush(), 30_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('beforeunload', () => void flush())
}

/** Sends whatever is buffered now — before opening the stats page, say. */
export function flushStats(): Promise<void> {
  return flush()
}
