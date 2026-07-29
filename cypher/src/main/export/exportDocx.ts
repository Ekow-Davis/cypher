import { writeFileSync } from 'node:fs'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak
} from 'docx'
import { contentToBlocks, type Block } from './tiptapToHtml'
import type { ExportBook } from './gather'
import type { ExportOptions } from './types'

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
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        strike: r.strike,
        font: r.code ? 'Consolas' : undefined
      })
  )
}

function blockToParagraph(block: Block): Paragraph {
  const children = runsFor(block)
  switch (block.kind) {
    case 'heading':
      return new Paragraph({ children, heading: HEADINGS[(block.level ?? 2) - 1] })
    case 'quote':
      return new Paragraph({ children, indent: { left: 720 }, spacing: { before: 120, after: 120 } })
    case 'bullet':
      return new Paragraph({ children, bullet: { level: 0 } })
    case 'ordered':
      return new Paragraph({ children, numbering: { reference: 'cypher-ordered', level: 0 } })
    case 'code':
      return new Paragraph({ children, spacing: { before: 120, after: 120 } })
    default:
      return new Paragraph({ children, spacing: { after: 120 } })
  }
}

export async function exportDocx(
  data: ExportBook,
  options: ExportOptions,
  destination: string
): Promise<void> {
  const children: Paragraph[] = []

  if (options.titlePage) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: data.book.title, bold: true, size: 56 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 3000, after: 240 }
      })
    )
    if (data.book.subtitle) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: data.book.subtitle, size: 28 })],
          alignment: AlignmentType.CENTER
        })
      )
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  let first = true
  for (const group of data.groups) {
    if (options.volumeHeadings && group.volumeTitle) {
      if (!first) children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(
        new Paragraph({
          children: [new TextRun({ text: group.volumeTitle, bold: true, size: 36 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 480 }
        })
      )
      first = false
    }

    for (const chapter of group.chapters) {
      if (!first) children.push(new Paragraph({ children: [new PageBreak()] }))
      first = false
      children.push(
        new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1, spacing: { after: 240 } })
      )
      if (options.includeSynopsis && chapter.synopsis) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: chapter.synopsis, italics: true })],
            spacing: { after: 240 }
          })
        )
      }
      for (const block of contentToBlocks(chapter.content)) {
        children.push(blockToParagraph(block))
      }
    }
  }

  const doc = new Document({
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

  writeFileSync(destination, await Packer.toBuffer(doc))
}
