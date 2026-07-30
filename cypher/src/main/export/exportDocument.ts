import { writeFileSync } from 'node:fs'
import { dialog, BrowserWindow } from 'electron'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  FootnoteReferenceRun,
  HeadingLevel,
  AlignmentType
} from 'docx'
import {
  contentToBlocks,
  contentToHtml,
  collectFootnotes,
  withFootnotes,
  type Block
} from './tiptapToHtml'
import { documentToHtml } from './bookHtml'
import { getDocument } from '../db/repositories/documents'

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

/**
 * Blocks carry footnote markers as a sentinel run; swap them for real Word
 * footnote references, numbered in document order.
 */
function withFootnoteRefs(blocks: Block[], total: number): Block[] {
  if (!total) return blocks
  let n = 0
  for (const block of blocks) {
    block.runs = block.runs.map((r) =>
      r.text === '\u0000footnote' ? { text: '', footnote: ++n } : r
    ) as never
  }
  return blocks
}

function toParagraph(block: Block): Paragraph {
  if (block.kind === 'pagebreak') return new Paragraph({ children: [new PageBreak()] })
  const children = block.runs.length
    ? block.runs.map((r) => {
        const note = (r as { footnote?: number }).footnote
        if (note) return new FootnoteReferenceRun(note)
        return new TextRun({ text: r.text, bold: r.bold, italics: r.italic, strike: r.strike })
      })
    : [new TextRun('')]

  switch (block.kind) {
    case 'heading':
      return new Paragraph({ children, heading: HEADINGS[(block.level ?? 2) - 1] })
    case 'quote':
      return new Paragraph({ children, indent: { left: 720 } })
    case 'bullet':
      return new Paragraph({ children, bullet: { level: 0 } })
    case 'ordered':
      return new Paragraph({ children, numbering: { reference: 'doc-ordered', level: 0 } })
    default:
      return new Paragraph({ children, spacing: { after: 120 } })
  }
}

/**
 * Turns our header/footer template into docx runs. {page} and {pages} become
 * genuine Word fields, so an exported document renumbers itself if it reflows —
 * which static text could never do.
 */
function runningRuns(template: string, title: string): TextRun[] {
  if (!template.trim()) return []
  const parts = template.split(/(\{page\}|\{pages\}|\{title\}|\{date\})/g)
  const children: (string | typeof PageNumber.CURRENT)[] = []
  for (const part of parts) {
    if (!part) continue
    if (part === '{page}') children.push(PageNumber.CURRENT)
    else if (part === '{pages}') children.push(PageNumber.TOTAL_PAGES)
    else if (part === '{title}') children.push(title)
    else if (part === '{date}') children.push(new Date().toLocaleDateString())
    else children.push(part)
  }
  return [new TextRun({ children: children as never })]
}

function safeName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Document'
}

export interface DocExportResult {
  path: string | null
  cancelled?: boolean
  error?: string
}

export async function exportDocumentAs(
  id: number,
  format: 'docx' | 'pdf'
): Promise<DocExportResult> {
  const doc = getDocument(id)
  if (!doc) return { path: null, error: 'Document not found.' }

  const picked = await dialog.showSaveDialog({
    title: `Export as ${format.toUpperCase()}`,
    defaultPath: `${safeName(doc.title)}.${format}`,
    filters: [
      format === 'docx'
        ? { name: 'Word document', extensions: ['docx'] }
        : { name: 'PDF', extensions: ['pdf'] }
    ]
  })
  if (picked.canceled || !picked.filePath) return { path: null, cancelled: true }

  try {
    if (format === 'docx') {
      const notes = collectFootnotes(doc.content)
      // Word footnotes are real page-bottom notes, numbered by Word itself.
      const footnotes = Object.fromEntries(
        notes.map((text, i) => [i + 1, { children: [new Paragraph(text)] }])
      )
      const headerRuns = runningRuns(doc.header ?? '', doc.title)
      const footerRuns = runningRuns(doc.footer ?? '', doc.title)

      const document = new Document({
        ...(notes.length ? { footnotes } : {}),
        numbering: {
          config: [
            {
              reference: 'doc-ordered',
              levels: [
                { level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }
              ]
            }
          ]
        },
        sections: [
          {
            ...(headerRuns.length
              ? { headers: { default: new Header({ children: [new Paragraph({ children: headerRuns })] }) } }
              : {}),
            ...(footerRuns.length
              ? { footers: { default: new Footer({ children: [new Paragraph({ children: footerRuns })] }) } }
              : {}),
            children: withFootnoteRefs(contentToBlocks(doc.content), notes.length).map(toParagraph)
          }
        ]
      })
      writeFileSync(picked.filePath, await Packer.toBuffer(document))
    } else {
      // Same HTML the printer and preview use, so all three agree.
      const html = documentToHtml(
        doc.title,
        withFootnotes(contentToHtml(doc.content), collectFootnotes(doc.content))
      )
      const win = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true, javascript: false }
      })
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'Letter',
          margins: { top: 1, bottom: 1, left: 1, right: 1 }
        })
        writeFileSync(picked.filePath, pdf)
      } finally {
        win.destroy()
      }
    }
    return { path: picked.filePath }
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : String(e) }
  }
}
