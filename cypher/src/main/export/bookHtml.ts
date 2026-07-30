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
  .toc { page-break-after: always; }
  .toc h1 { text-align: center; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { margin: 0.35em 0; }
  .toc .vol { font-weight: 700; margin-top: 1em; }
  .toc a { color: #111; text-decoration: none; }
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

  // A linked contents page. Chromium turns same-document anchors into real PDF
  // links, so these are clickable (and Ctrl-clickable) in the exported file.
  if (options.tableOfContents) {
    const rows: string[] = []
    for (const group of data.groups) {
      if (options.volumeHeadings && group.volumeTitle) {
        rows.push(`<li class="vol">${escapeHtml(group.volumeTitle)}</li>`)
      }
      for (const chapter of group.chapters) {
        rows.push(`<li><a href="#ch-${chapter.id}">${escapeHtml(chapter.title)}</a></li>`)
      }
    }
    parts.push(`<div class="toc"><h1>Contents</h1><ol>${rows.join('')}</ol></div>`)
  }

  for (const group of data.groups) {
    if (options.volumeHeadings && group.volumeTitle) {
      parts.push(`<div class="volume">${escapeHtml(group.volumeTitle)}</div>`)
    }
    for (const chapter of group.chapters) {
      parts.push(
        `<section class="chapter"><h1 id="ch-${chapter.id}">${escapeHtml(chapter.title)}</h1>`
      )
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

export const DOC_PRINT_CSS = `
  /* Mirrors .cypher-doc so the printed page count matches the editor's. */
  @page { size: Letter; margin: 1in; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #111;
    margin: 0;
  }
  p { margin: 0 0 0.6em; }
  h1 { font-size: 20pt; font-weight: 700; margin: 0.6em 0 0.4em; }
  h2 { font-size: 16pt; font-weight: 700; margin: 0.6em 0 0.35em; }
  h3 { font-size: 13pt; font-weight: 700; margin: 0.5em 0 0.3em; }
  ul { list-style: disc; padding-left: 1.6em; margin: 0.4em 0; }
  ol { list-style: decimal; padding-left: 1.6em; margin: 0.4em 0; }
  blockquote { border-left: 3px solid #ccc; margin: 0.6em 0; padding-left: 1em; color: #444; }
  pre { background: #f4f4f5; border-radius: 4px; padding: 0.6em 0.8em; font-family: Consolas, monospace; font-size: 10.5pt; }
  code { font-family: Consolas, monospace; font-size: 0.92em; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; table-layout: fixed; }
  th, td { border: 1px solid #c9c9cf; padding: 6px 8px; vertical-align: top; }
  th { background: #f1f1f4; font-weight: 700; text-align: left; }
  img { max-width: 100%; height: auto; }
  a { color: #1d4ed8; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
  /* the editor's break marker becomes a genuine page break here */
  [data-page-break] { break-after: page; page-break-after: always; height: 0; }
  .toc-block { margin: 1em 0 1.4em; }
  .toc-title { font-size: 1.35em; font-weight: 700; margin-bottom: 0.6em; }
  .toc-row { display: flex; align-items: baseline; gap: 0.4em; line-height: 1.9; }
  .toc-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toc-dots { flex: 1 1 auto; border-bottom: 1px dotted currentColor; opacity: 0.45; transform: translateY(-0.25em); }
  .toc-page { font-variant-numeric: tabular-nums; }
  .toc-level-2 { padding-left: 1.2em; }
  .toc-level-3 { padding-left: 2.4em; }
  .footnote-ref { font-size: 0.72em; vertical-align: super; line-height: 0; font-weight: 700; }
  .footnotes { margin-top: 2em; padding-top: 0.8em; border-top: 1px solid #c9c9cf; font-size: 0.85em; color: #444; }
  .footnotes-title { font-weight: 700; margin-bottom: 0.4em; }
  .footnote-item { margin: 0.2em 0; }
`

/** Wraps a document's rendered body in a printable page. */
export function documentToHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(
    title
  )}</title><style>${DOC_PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`
}
