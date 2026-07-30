import { writeFileSync } from 'node:fs'
import { dialog, BrowserWindow } from 'electron'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  HeadingLevel,
  AlignmentType
} from 'docx'
import { contentToBlocks, contentToHtml, type Block } from './tiptapToHtml'
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

function toParagraph(block: Block): Paragraph {
  if (block.kind === 'pagebreak') return new Paragraph({ children: [new PageBreak()] })
  const children = block.runs.length
    ? block.runs.map(
        (r) =>
          new TextRun({ text: r.text, bold: r.bold, italics: r.italic, strike: r.strike })
      )
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
      const document = new Document({
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
        sections: [{ children: contentToBlocks(doc.content).map(toParagraph) }]
      })
      writeFileSync(picked.filePath, await Packer.toBuffer(document))
    } else {
      // Same HTML the printer and preview use, so all three agree.
      const html = documentToHtml(doc.title, contentToHtml(doc.content))
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
