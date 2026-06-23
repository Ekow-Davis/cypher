interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
}

/** Flattens a stringified Tiptap document into plain text. */
export function extractPlainText(json: string): string {
  if (!json) return ''
  let doc: TiptapNode
  try {
    doc = JSON.parse(json)
  } catch {
    return ''
  }
  const parts: string[] = []
  const walk = (n: TiptapNode): void => {
    if (n.text) parts.push(n.text)
    n.content?.forEach(walk)
  }
  walk(doc)
  return parts.join(' ')
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','of','at','by','for','with','about','to','from','in','on',
  'is','are','was','were','be','been','being','am','do','does','did','have','has','had','having',
  'i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our',
  'their','this','that','these','those','then','than','so','too','very','can','will','just','not',
  'no','yes','as','out','up','down','off','over','under','again','once','here','there','when','where',
  'why','how','all','any','both','each','few','more','most','other','some','such','only','own','same',
  'what','which','who','whom','said','say','says','like','got','get','one','would','could','should'
])

export interface FreqItem {
  term: string
  count: number
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? []
}

export function wordFrequency(text: string, limit = 12): FreqItem[] {
  const counts = new Map<string, number>()
  for (const w of tokenize(text)) {
    if (w.length < 3 || STOPWORDS.has(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function phraseFrequency(text: string, n = 2, limit = 8): FreqItem[] {
  const words = tokenize(text)
  const counts = new Map<string, number>()
  for (let i = 0; i + n <= words.length; i++) {
    const gram = words.slice(i, i + n)
    if (gram.some((w) => w.length < 3 || STOPWORDS.has(w))) continue
    const key = gram.join(' ')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
