import { contentToHtml, escapeHtml } from './tiptapToHtml'
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
  .title-page { text-align: center; page-break-after: always; padding-top: 30vh; }
  .title-page h1 { font-size: 30pt; margin-bottom: 0.5em; }
  .volume { text-align: center; page-break-before: always; margin: 3em 0; font-size: 20pt; font-weight: 700; }
  .chapter { page-break-before: always; }
  .chapter:first-of-type { page-break-before: avoid; }
  .synopsis { font-style: italic; color: #555; margin-bottom: 1.4em; }
`

/** One self-contained HTML document for the whole book — used for PDF printing. */
export function bookToHtml(data: ExportBook, options: ExportOptions): string {
  const parts: string[] = []

  if (options.titlePage) {
    parts.push(
      `<div class="title-page"><h1>${escapeHtml(data.book.title)}</h1>` +
        (data.book.subtitle ? `<p>${escapeHtml(data.book.subtitle)}</p>` : '') +
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
