import { contentToHtml, escapeHtml } from './tiptapToHtml'
import { loadCover } from './cover'
import type { ExportBook } from './gather'
import type { ExportOptions } from './types'

export const PRINT_CSS = `
  @page { margin: 22mm 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #111; }
  h1 { font-size: 20pt; margin: 0 0 1em; }
  h2 { font-size: 16pt; }
  h3 { font-size: 13pt; }
  p { margin: 0 0 0.7em; text-align: justify; }
  blockquote { margin: 0.8em 0 0.8em 1.5em; font-style: italic; color: #444; }
  ul, ol { margin: 0.6em 0 0.6em 1.4em; }
  code { font-family: Consolas, monospace; font-size: 0.9em; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1.4em 0; }
  .mention { font-weight: 600; }
  .cover-page { page-break-after: always; text-align: center; }
  .cover-page img { max-width: 100%; max-height: 96vh; }
  .title-page { text-align: center; page-break-after: always; padding-top: 30vh; }
  .byline { margin-top: 3em; font-size: 14pt; }
  .title-page h1 { font-size: 30pt; margin-bottom: 0.5em; }
  .volume { text-align: center; page-break-before: always; margin: 3em 0; font-size: 20pt; font-weight: 700; }
  .chapter { page-break-before: always; }
  .chapter:first-of-type { page-break-before: avoid; }
  .synopsis { font-style: italic; color: #555; margin-bottom: 1.4em; }
`

/** One self-contained HTML document for the whole book — used for PDF printing. */
export function bookToHtml(data: ExportBook, options: ExportOptions): string {
  const parts: string[] = []

  // Inlined as a data URI so the printed document needs no external files.
  if (options.includeCover) {
    const cover = loadCover(data.book.cover_path)
    if (cover) {
      parts.push(
        `<div class="cover-page"><img src="data:${cover.mime};base64,${cover.buffer.toString(
          'base64'
        )}" alt=""/></div>`
      )
    }
  }

  if (options.titlePage) {
    parts.push(
      `<div class="title-page"><h1>${escapeHtml(data.book.title)}</h1>` +
        (data.book.subtitle ? `<p>${escapeHtml(data.book.subtitle)}</p>` : '') +
        (options.author.trim()
          ? `<p class="byline">${escapeHtml(options.author.trim())}</p>`
          : '') +
        `</div>`
    )
  }

  for (const group of data.groups) {
    if (options.volumeHeadings && group.volumeTitle) {
      parts.push(`<div class="volume">${escapeHtml(group.volumeTitle)}</div>`)
    }
    for (const chapter of group.chapters) {
      parts.push(`<section class="chapter"><h1>${escapeHtml(chapter.title)}</h1>`)
      if (options.includeSynopsis && chapter.synopsis) {
        parts.push(`<p class="synopsis">${escapeHtml(chapter.synopsis)}</p>`)
      }
      parts.push(contentToHtml(chapter.content))
      parts.push(`</section>`)
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${escapeHtml(data.book.title)}</title><style>${PRINT_CSS}</style></head>
<body>${parts.join('\n')}</body></html>`
}
