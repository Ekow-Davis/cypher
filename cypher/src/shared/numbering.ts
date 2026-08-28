/**
 * Chapter numbering, computed from position rather than stored.
 *
 * Numbers live nowhere in the database. Every surface — the sidebar, the
 * editor header, the table of contents, all three export formats — asks this
 * module for a chapter's display title, so inserting a chapter anywhere
 * renumbers everything after it with no data to migrate and nothing that can
 * fall out of step. Titles hold only the writer's own words.
 */

export type NumberingStyle = 'off' | 'chapter' | 'number' | 'roman'

export interface NumberableChapter {
  id: number
  title: string
  volume_id: number | null
  sort_order: number
}

export interface NumberableVolume {
  id: number
  /** 0 excludes this volume's chapters from the running count. */
  numbered: number
  /** Used instead of a number when the volume is excluded, e.g. "Interlude". */
  unnumbered_label: string
}

export interface NumberedChapter {
  id: number
  /** The writer's title, with no number attached. */
  rawTitle: string
  /** What to show: "Chapter 12 — The Reckoning", or just the title. */
  displayTitle: string
  /** Position in the numbered sequence, or null when excluded. */
  number: number | null
  /** The prefix alone, for surfaces that lay it out separately. */
  prefix: string | null
}

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
]

export function toRoman(value: number): string {
  let n = value
  let out = ''
  for (const [amount, numeral] of ROMAN) {
    while (n >= amount) {
      out += numeral
      n -= amount
    }
  }
  return out || String(value)
}

function prefixFor(style: NumberingStyle, n: number): string | null {
  switch (style) {
    case 'chapter':
      return `Chapter ${n}`
    case 'number':
      return String(n)
    case 'roman':
      return toRoman(n)
    default:
      return null
  }
}

/**
 * Strips a number the writer previously typed into a title.
 *
 * Once numbering is computed, a stored "Chapter 26 — " prefix would render as
 * "Chapter 27 — Chapter 26 — …". This recognises the common shapes so existing
 * manuscripts read correctly, and is also what the one-time cleanup uses.
 */
export function stripStoredNumber(title: string): string {
  const patterns = [
    // "Chapter 12 — Title", "Chapter XII: Title", "Part 3 - Title"
    /^\s*(chapter|part|book|section)\s+([0-9]+|[ivxlcdm]+)\s*[-—–:.]*\s*/i,
    // "12 — Title", "12. Title"
    /^\s*([0-9]{1,3}|[ivxlcdm]{1,7})\s*[-—–:.]\s+/i
  ]
  for (const pattern of patterns) {
    const stripped = title.replace(pattern, '')
    // Never strip away the entire title — "Chapter 12" alone stays as it is.
    if (stripped !== title && stripped.trim()) return stripped.trim()
  }
  return title
}

/** True when a title still carries a number that numbering would duplicate. */
export function hasStoredNumber(title: string): boolean {
  return stripStoredNumber(title) !== title
}

/**
 * Numbers a book's chapters in reading order.
 *
 * Excluded volumes don't advance the counter, so removing Volume 0 from the
 * count leaves the rest reading 1, 2, 3 without a gap where it used to sit.
 */
export function numberChapters(
  chapters: NumberableChapter[],
  volumes: NumberableVolume[],
  style: NumberingStyle
): NumberedChapter[] {
  const byId = new Map(volumes.map((v) => [v.id, v]))
  const ordered = [...chapters].sort((a, b) => a.sort_order - b.sort_order)

  let counter = 0
  const unnumberedCounters = new Map<number, number>()

  return ordered.map((chapter) => {
    const rawTitle = chapter.title
    const volume = chapter.volume_id != null ? byId.get(chapter.volume_id) : undefined
    const excluded = volume ? volume.numbered === 0 : false

    if (style === 'off') {
      return { id: chapter.id, rawTitle, displayTitle: rawTitle, number: null, prefix: null }
    }

    if (excluded) {
      const label = volume?.unnumbered_label?.trim()
      if (!label) {
        return { id: chapter.id, rawTitle, displayTitle: rawTitle, number: null, prefix: null }
      }
      // Excluded volumes with a label get their own sequence: Interlude 1, 2…
      const next = (unnumberedCounters.get(volume!.id) ?? 0) + 1
      unnumberedCounters.set(volume!.id, next)
      const prefix = `${label} ${next}`
      return {
        id: chapter.id,
        rawTitle,
        displayTitle: rawTitle ? `${prefix} — ${rawTitle}` : prefix,
        number: null,
        prefix
      }
    }

    counter += 1
    const prefix = prefixFor(style, counter)
    return {
      id: chapter.id,
      rawTitle,
      displayTitle: prefix && rawTitle ? `${prefix} — ${rawTitle}` : (prefix ?? rawTitle),
      number: counter,
      prefix
    }
  })
}
