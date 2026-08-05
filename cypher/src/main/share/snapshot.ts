import { readFileSync, existsSync } from 'node:fs'
import { extname } from 'node:path'
import { gatherBook } from '../export/gather'
import { contentToHtml, resolveReferences, collectFootnotes, withFootnotes } from '../export/tiptapToHtml'
import { absoluteAssetPath } from '../assets'
import type { ShareScope, ShareSnapshot } from '@shared/types'

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

function coverDataUri(coverPath: string | null): string | null {
  if (!coverPath) return null
  try {
    const abs = absoluteAssetPath(coverPath)
    if (!existsSync(abs)) return null
    const mime = IMAGE_MIME[extname(abs).toLowerCase()]
    if (!mime) return null
    return `data:${mime};base64,${readFileSync(abs).toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Freezes a book into a self-contained payload for sharing.
 *
 * Takes a bookId and nothing else — there is deliberately no parameter that
 * could ever address diary content, so no future caller can accidentally
 * publish it. Chapter bodies are rendered through the same converter the
 * exporters use, so a shared chapter reads exactly like an exported one.
 */
export function buildSnapshot(bookId: number, scope: ShareScope): ShareSnapshot | null {
  const data = gatherBook(bookId, scope.chapterIds)
  if (!data) return null

  const chapters: ShareSnapshot['chapters'] = []
  for (const group of data.groups) {
    for (const chapter of group.chapters) {
      const resolved = resolveReferences(chapter.content)
      const html = withFootnotes(contentToHtml(resolved), collectFootnotes(resolved))
      chapters.push({
        id: chapter.id,
        title: chapter.title,
        volume: group.volumeTitle,
        synopsis: scope.includeSynopsis ? chapter.synopsis || null : null,
        html,
        words: chapter.word_count
      })
    }
  }

  return {
    title: data.book.title,
    subtitle: data.book.subtitle,
    author: data.book.author,
    language: data.book.language || 'en',
    coverDataUri: scope.includeCover ? coverDataUri(data.book.cover_path) : null,
    builtAt: new Date().toISOString(),
    chapters
  }
}
