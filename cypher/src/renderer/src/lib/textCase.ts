/** Case transforms for selected text. */

export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence'

/**
 * Words that stay lowercase inside a title, unless they open or close it.
 * Without this, "the lord of the rings" title-cases into "The Lord Of The
 * Rings", which is not how titles are actually written.
 */
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'if', 'in', 'into',
  'nor', 'of', 'off', 'on', 'onto', 'or', 'over', 'per', 'so', 'the', 'to',
  'up', 'via', 'with', 'yet'
])

function capitalise(word: string): string {
  if (!word) return word
  // Preserve any leading punctuation such as an opening quote or bracket.
  const match = word.match(/^([^\p{L}\p{N}]*)(.*)$/u)
  if (!match) return word
  const [, lead, rest] = match
  if (!rest) return word
  return lead + rest[0].toLocaleUpperCase() + rest.slice(1).toLocaleLowerCase()
}

export function toTitleCase(text: string): string {
  const words = text.toLocaleLowerCase().split(/(\s+)/)
  const wordIndexes = words
    .map((w, i) => (w.trim() ? i : -1))
    .filter((i) => i !== -1)
  const first = wordIndexes[0]
  const last = wordIndexes[wordIndexes.length - 1]

  return words
    .map((word, i) => {
      if (!word.trim()) return word
      const bare = word.replace(/[^\p{L}\p{N}']/gu, '')
      if (i !== first && i !== last && MINOR_WORDS.has(bare)) return word
      return capitalise(word)
    })
    .join('')
}

/** Capitalises the first letter of each sentence, leaving the rest lowercase. */
export function toSentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase()
  return lower.replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (_m, prefix, letter) =>
    prefix + letter.toLocaleUpperCase()
  )
}

export function applyCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return text.toLocaleUpperCase()
    case 'lower':
      return text.toLocaleLowerCase()
    case 'title':
      return toTitleCase(text)
    case 'sentence':
      return toSentenceCase(text)
    default:
      return text
  }
}
