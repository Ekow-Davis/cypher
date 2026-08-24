import { getSetting } from './settings'

/**
 * Synonym and antonym lookup, backed by the Datamuse API.
 *
 * This is the one feature in Cypher that reaches the internet during ordinary
 * writing, so it is off unless the writer turns it on, and it sends exactly one
 * word — never surrounding text, never the document. Bundling WordNet instead
 * would keep it offline but add roughly 35MB to every install and to every
 * update patch, which is a poor trade for a feature used a few times an hour.
 */

export interface ThesaurusResult {
  word: string
  synonyms: string[]
  antonyms: string[]
  /** Set when the lookup could not run, for the UI to explain rather than sit blank. */
  error?: string
}

const ENDPOINT = 'https://api.datamuse.com/words'
const cache = new Map<string, ThesaurusResult>()
const MAX_CACHE = 200

export function thesaurusEnabled(): boolean {
  return getSetting('thesaurusEnabled') === true
}

async function fetchRelated(relation: 'rel_syn' | 'rel_ant', word: string): Promise<string[]> {
  const url = `${ENDPOINT}?${relation}=${encodeURIComponent(word)}&max=12`
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`)
  const data = (await response.json()) as { word: string }[]
  return data.map((entry) => entry.word)
}

export async function lookupWord(raw: string): Promise<ThesaurusResult> {
  const word = raw.trim().toLowerCase().replace(/[^a-z'-]/g, '')
  if (!word) return { word: raw, synonyms: [], antonyms: [] }

  if (!thesaurusEnabled()) {
    return {
      word,
      synonyms: [],
      antonyms: [],
      error: 'The thesaurus is off. Turn it on in Settings → Writing.'
    }
  }

  const cached = cache.get(word)
  if (cached) return cached

  try {
    // Both directions in parallel; a word usually has one or the other.
    const [synonyms, antonyms] = await Promise.all([
      fetchRelated('rel_syn', word),
      fetchRelated('rel_ant', word)
    ])
    const result: ThesaurusResult = { word, synonyms, antonyms }
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
    cache.set(word, result)
    return result
  } catch (e) {
    const offline = e instanceof Error && /fetch|network|timeout|abort/i.test(e.message)
    return {
      word,
      synonyms: [],
      antonyms: [],
      error: offline
        ? 'Could not reach the thesaurus — check your connection.'
        : e instanceof Error
          ? e.message
          : String(e)
    }
  }
}
