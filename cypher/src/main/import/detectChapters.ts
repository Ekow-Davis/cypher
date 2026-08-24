/**
 * Finds chapter boundaries in an imported manuscript.
 *
 * Two signals, in order of trust:
 *   1. Real headings (h1/h2) — if the author used Word's heading styles, that
 *      is an explicit statement of structure and beats any guess.
 *   2. Title-shaped lines — "Chapter 4", "4 — The Fall", "IV. Homecoming".
 *
 * A guess only counts when the line is short and stands alone, because prose
 * routinely contains the word "chapter" mid-sentence and splitting there would
 * shred the manuscript.
 */

export interface DetectedChapter {
  title: string
  /** Paragraph HTML belonging to this chapter. */
  html: string
  words: number
}

export type DetectionMode = 'headings' | 'patterns' | 'none'

export interface DetectionResult {
  mode: DetectionMode
  chapters: DetectedChapter[]
}

/** "Chapter 12", "CHAPTER XII — Title", "12. Title", "12 - Title", "Prologue". */
const NUMBERED = /^\s*(chapter|part|book|section)\s+([0-9]+|[ivxlcdm]+)\b[\s.:—–-]*(.*)$/i
const BARE_NUMBER = /^\s*([0-9]{1,3}|[ivxlcdm]{1,7})\s*[.:—–-]\s*(.{0,80})$/i
const NAMED = /^\s*(prologue|epilogue|foreword|preface|afterword|interlude|introduction)\b[\s.:—–-]*(.*)$/i

const MAX_TITLE_WORDS = 12

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Does this standalone line look like a chapter title rather than prose? */
function titleFrom(text: string): string | null {
  const line = text.trim()
  if (!line || countWords(line) > MAX_TITLE_WORDS) return null
  // A line ending in a sentence full stop is almost certainly prose.
  if (/[.!?]["')\]]?$/.test(line) && !NUMBERED.test(line) && !NAMED.test(line)) return null

  const numbered = line.match(NUMBERED)
  if (numbered) {
    const label = `${numbered[1][0].toUpperCase()}${numbered[1].slice(1).toLowerCase()} ${numbered[2]}`
    const rest = numbered[3]?.trim()
    return rest ? `${label} — ${rest}` : label
  }

  const named = line.match(NAMED)
  if (named) {
    const label = `${named[1][0].toUpperCase()}${named[1].slice(1).toLowerCase()}`
    const rest = named[2]?.trim()
    return rest ? `${label} — ${rest}` : label
  }

  const bare = line.match(BARE_NUMBER)
  if (bare && bare[2].trim()) return `${bare[1]} — ${bare[2].trim()}`

  return null
}

/** Splits HTML into top-level blocks without needing a DOM. */
function blocksOf(html: string): string[] {
  const matches = html.match(/<(h[1-6]|p|blockquote|ul|ol|pre|table|figure|div)[\s>][\s\S]*?<\/\1>/gi)
  if (matches?.length) return matches
  return html
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('<') ? s : `<p>${s}</p>`))
}

export function detectChapters(html: string): DetectionResult {
  const blocks = blocksOf(html)
  if (!blocks.length) return { mode: 'none', chapters: [] }

  const headingIndexes: number[] = []
  const patternIndexes: { index: number; title: string }[] = []

  blocks.forEach((block, index) => {
    if (/^<h[12][\s>]/i.test(block)) {
      headingIndexes.push(index)
      return
    }
    const text = stripTags(block)
    const title = titleFrom(text)
    if (title) patternIndexes.push({ index, title })
  })

  // Headings win when present — they are explicit rather than inferred.
  const useHeadings = headingIndexes.length >= 2
  const usePatterns = !useHeadings && patternIndexes.length >= 2
  if (!useHeadings && !usePatterns) {
    return {
      mode: 'none',
      chapters: [
        {
          title: 'Imported text',
          html: blocks.join('\n'),
          words: countWords(stripTags(blocks.join(' ')))
        }
      ]
    }
  }

  const starts = useHeadings
    ? headingIndexes.map((index) => ({ index, title: stripTags(blocks[index]) }))
    : patternIndexes

  const chapters: DetectedChapter[] = []

  // Anything before the first boundary is front matter, not part of chapter one.
  if (starts[0].index > 0) {
    const body = blocks.slice(0, starts[0].index)
    const text = stripTags(body.join(' '))
    if (text) {
      chapters.push({ title: 'Front matter', html: body.join('\n'), words: countWords(text) })
    }
  }

  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : blocks.length
    // The title line itself is dropped from the body — it becomes the chapter's
    // name, and repeating it at the top of the text is noise.
    const body = blocks.slice(start.index + 1, end)
    const text = stripTags(body.join(' '))
    chapters.push({
      title: start.title.trim() || `Chapter ${i + 1}`,
      html: body.join('\n'),
      words: countWords(text)
    })
  })

  return { mode: useHeadings ? 'headings' : 'patterns', chapters }
}
