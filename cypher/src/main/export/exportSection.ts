import { writeFileSync } from 'node:fs'
import { BrowserWindow } from 'electron'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Bookmark,
  InternalHyperlink,
  HeadingLevel,
  AlignmentType,
  PageBreak
} from 'docx'
import { escapeHtml, type Block } from './tiptapToHtml'
import { loadCover, fitBox } from './cover'
import { PRINT_CSS } from './bookHtml'
import type { SectionedDoc } from './sectioned'
import type { SectionExportOptions } from '@shared/types'

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

function runsFor(block: Block): TextRun[] {
  if (!block.runs.length) return [new TextRun('')]
  return block.runs.map(
    (r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, strike: r.strike })
  )
}

function blockToParagraph(block: Block): Paragraph {
  if (block.kind === 'pagebreak') return new Paragraph({ children: [new PageBreak()] })
  const children = runsFor(block)
  switch (block.kind) {
    case 'heading':
      return new Paragraph({ children, heading: HEADINGS[(block.level ?? 2) - 1] })
    case 'quote':
      return new Paragraph({ children, indent: { left: 720 } })
    case 'bullet':
      return new Paragraph({ children, bullet: { level: 0 } })
    case 'ordered':
      return new Paragraph({ children, numbering: { reference: 'cypher-ordered', level: 0 } })
    default:
      return new Paragraph({ children, spacing: { after: 100 } })
  }
}

export async function exportSectionDocx(
  doc: SectionedDoc,
  options: SectionExportOptions,
  destination: string
): Promise<void> {
  const children: Paragraph[] = []

  if (options.titlePage) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.docTitle, bold: true, size: 48 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 2600, after: 240 }
      })
    )
    if (options.author.trim()) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: options.author.trim(), size: 26 })],
          alignment: AlignmentType.CENTER
        })
      )
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // Contents: groups as headings, entries as links to their bookmarks.
  if (options.tableOfContents) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Contents', bold: true, size: 32 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 }
      })
    )
    for (const group of doc.groups) {
      if (options.groupHeadings) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: group.title, bold: true })],
            spacing: { before: 200, after: 60 }
          })
        )
      }
      for (const entry of group.entries) {
        children.push(
          new Paragraph({
            indent: { left: options.groupHeadings ? 360 : 0 },
            children: [
              new InternalHyperlink({
                anchor: `e${entry.id}`,
                children: [new TextRun({ text: entry.title, style: 'Hyperlink' })]
              })
            ],
            spacing: { after: 40 }
          })
        )
      }
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  let first = true
  for (const group of doc.groups) {
    if (options.groupHeadings) {
      if (!first) children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(
        new Paragraph({
          children: [new TextRun({ text: group.title, bold: true, size: 36 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 320, after: 320 }
        })
      )
      first = false
    }

    for (const entry of group.entries) {
      if (!first) children.push(new Paragraph({ children: [new PageBreak()] }))
      first = false

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          children: [new Bookmark({ id: `e${entry.id}`, children: [new TextRun(entry.title)] })]
        })
      )

      if (options.includePortraits && entry.imagePath) {
        const img = loadCover(entry.imagePath)
        if (img) {
          const { width, height } = fitBox(img, 200, 260)
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: img.ext === '.png' ? 'png' : img.ext === '.gif' ? 'gif' : 'jpg',
                  data: img.buffer,
                  transformation: { width, height }
                })
              ],
              spacing: { after: 200 }
            })
          )
        }
      }

      for (const block of entry.blocks) children.push(blockToParagraph(block))
      if (!entry.blocks.length) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '(no details recorded)', italics: true })]
          })
        )
      }
    }
  }

  const document = new Document({
    numbering: {
      config: [
        {
          reference: 'cypher-ordered',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }]
        }
      ]
    },
    sections: [{ children }]
  })
  writeFileSync(destination, await Packer.toBuffer(document))
}

function sectionHtml(doc: SectionedDoc, options: SectionExportOptions): string {
  const parts: string[] = []

  if (options.titlePage) {
    parts.push(
      `<div class="title-page"><h1>${escapeHtml(doc.docTitle)}</h1>` +
        (options.author.trim() ? `<p class="byline">${escapeHtml(options.author.trim())}</p>` : '') +
        `</div>`
    )
  }

  if (options.tableOfContents) {
    const rows: string[] = []
    for (const group of doc.groups) {
      if (options.groupHeadings) rows.push(`<li class="vol">${escapeHtml(group.title)}</li>`)
      for (const entry of group.entries) {
        rows.push(`<li><a href="#e-${entry.id}">${escapeHtml(entry.title)}</a></li>`)
      }
    }
    parts.push(`<div class="toc"><h1>Contents</h1><ol>${rows.join('')}</ol></div>`)
  }

  for (const group of doc.groups) {
    if (options.groupHeadings) {
      parts.push(`<div class="volume">${escapeHtml(group.title)}</div>`)
    }
    for (const entry of group.entries) {
      parts.push(`<section class="chapter"><h1 id="e-${entry.id}">${escapeHtml(entry.title)}</h1>`)
      if (options.includePortraits && entry.imagePath) {
        const img = loadCover(entry.imagePath)
        if (img) {
          parts.push(
            `<img class="portrait" src="data:${img.mime};base64,${img.buffer.toString(
              'base64'
            )}" alt=""/>`
          )
        }
      }
      parts.push(entry.html || '<p><em>(no details recorded)</em></p>')
      parts.push('</section>')
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(
    doc.docTitle
  )}</title><style>${PRINT_CSS}
  .portrait { max-width: 190px; max-height: 250px; float: right; margin: 0 0 1em 1em; border-radius: 6px; }
  </style></head><body>${parts.join('\n')}</body></html>`
}

export async function exportSectionPdf(
  doc: SectionedDoc,
  options: SectionExportOptions,
  destination: string
): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false }
  })
  try {
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(sectionHtml(doc, options))}`
    )
    const base = {
      printBackground: true,
      pageSize: 'A4' as const,
      margins: { top: 0.8, bottom: 0.8, left: 0.7, right: 0.7 }
    }
    let pdf: Buffer
    try {
      pdf = await win.webContents.printToPDF({ ...base, generateDocumentOutline: true })
    } catch {
      pdf = await win.webContents.printToPDF(base)
    }
    writeFileSync(destination, pdf)
  } finally {
    win.destroy()
  }
}
