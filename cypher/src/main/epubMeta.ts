import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { posix } from 'node:path'

export interface EpubMetadata {
  title?: string
  author?: string
  cover?: { data: Buffer; ext: string }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'"
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

function tagText(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i').exec(xml)
  const value = m?.[1] ? decode(m[1]) : ''
  return value || undefined
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
}

/** Pulls out every `<item>` in the manifest as an attribute map. */
function manifestItems(opf: string): Record<string, string>[] {
  const items: Record<string, string>[] = []
  for (const m of opf.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attrs: Record<string, string> = {}
    for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2]
    items.push(attrs)
  }
  return items
}

/**
 * Reads title, author, and cover art straight out of an EPUB.
 * Parsed with targeted patterns rather than a full XML stack: this is a
 * best-effort enrichment, and anything it can't find simply falls back to the
 * filename, so a malformed package can never block an import.
 */
export async function readEpubMetadata(absPath: string): Promise<EpubMetadata> {
  try {
    const zip = await JSZip.loadAsync(await readFile(absPath))

    const container = await zip.file('META-INF/container.xml')?.async('string')
    if (!container) return {}
    const opfPath = /full-path\s*=\s*"([^"]+)"/i.exec(container)?.[1]
    if (!opfPath) return {}
    const opf = await zip.file(opfPath)?.async('string')
    if (!opf) return {}

    const out: EpubMetadata = {
      title: tagText(opf, 'title'),
      author: tagText(opf, 'creator')
    }

    // Cover: the EPUB 3 property first, then the EPUB 2 meta pointer.
    const items = manifestItems(opf)
    let coverItem = items.find((i) => (i.properties ?? '').includes('cover-image'))
    if (!coverItem) {
      const metaId = /<meta\b[^>]*name\s*=\s*"cover"[^>]*content\s*=\s*"([^"]+)"/i.exec(opf)?.[1]
      if (metaId) coverItem = items.find((i) => i.id === metaId)
    }

    if (coverItem?.href) {
      const opfDir = posix.dirname(opfPath.replace(/\\/g, '/'))
      const href = decodeURIComponent(coverItem.href)
      const full = opfDir === '.' ? href : posix.normalize(`${opfDir}/${href}`)
      const file = zip.file(full)
      if (file) {
        const ext =
          EXT_BY_MIME[(coverItem['media-type'] ?? '').toLowerCase()] ??
          posix.extname(full).toLowerCase() ??
          '.png'
        out.cover = { data: await file.async('nodebuffer'), ext }
      }
    }

    return out
  } catch {
    return {}
  }
}
