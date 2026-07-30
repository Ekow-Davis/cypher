import { writeFileSync } from 'node:fs'
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
import { loadCover, fitBox } from './cover'
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
  if (block.kind === 'pagebreak') return new Paragraph({ children: [new PageBreak()] })
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

  // Cover art becomes the opening page, sized to the printable area.
  if (options.includeCover) {
    const cover = loadCover(data.book.cover_path)
    if (cover) {
      const { width, height } = fitBox(cover, 460, 620)
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: cover.ext === '.png' ? 'png' : cover.ext === '.gif' ? 'gif' : 'jpg',
              data: cover.buffer,
              transformation: { width, height }
            })
          ],
          alignment: AlignmentType.CENTER
        })
      )
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }

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
    if (options.author.trim()) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: options.author.trim(), size: 26 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 480 }
        })
      )
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // A bookmark-backed contents page. Word's TOC field needs the reader to
  // refresh fields before it shows anything; internal hyperlinks to bookmarks
  // work the moment the file opens, and Ctrl-click jumps as expected.
  if (options.tableOfContents) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Contents', bold: true, size: 32 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 }
      })
    )
    for (const group of data.groups) {
      if (options.volumeHeadings && group.volumeTitle) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: group.volumeTitle, bold: true })],
            spacing: { before: 200, after: 80 }
          })
        )
      }
      for (const chapter of group.chapters) {
        children.push(
          new Paragraph({
            children: [
              new InternalHyperlink({
                anchor: `ch${chapter.id}`,
                children: [new TextRun({ text: chapter.title, style: 'Hyperlink' })]
              })
            ],
            spacing: { after: 60 }
          })
        )
      }
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
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 240 },
          children: [
            new Bookmark({
              id: `ch${chapter.id}`,
              children: [new TextRun(chapter.title)]
            })
          ]
        })
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
