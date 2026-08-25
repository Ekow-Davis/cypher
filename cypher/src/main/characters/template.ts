import { writeFileSync } from 'node:fs'
import { dialog } from 'electron'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle
} from 'docx'
import { defaultCharacterSheet } from '@shared/characterTemplate'

/**
 * Writes the character sheet as a fillable Word document.
 *
 * Generated from defaultCharacterSheet() rather than hand-written, so the
 * template and the app's own sheet can never fall out of step — add a field in
 * one place and the download reflects it. The import parser reads the same
 * labels back, which is what lets a filled-in copy round-trip.
 */

const MARKER = 'CYPHER CHARACTER SHEET'

export async function exportCharacterTemplate(): Promise<{
  path: string | null
  cancelled?: boolean
  error?: string
}> {
  const picked = await dialog.showSaveDialog({
    title: 'Save character sheet template',
    defaultPath: 'Character Sheet.docx',
    filters: [{ name: 'Word document', extensions: ['docx'] }]
  })
  if (picked.canceled || !picked.filePath) return { path: null, cancelled: true }

  const sheet = defaultCharacterSheet()
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: MARKER, bold: true, size: 18, color: '888888' })],
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({
      text: 'Character Sheet',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Fill in whatever you like and leave the rest blank. Keep the field labels as they are — Cypher matches on them when importing. To include several characters in one file, start each with a "Name:" line.',
          italics: true,
          size: 18,
          color: '666666'
        })
      ],
      spacing: { after: 300 }
    }),
    // Name is the one field that lives outside the sections, and it doubles as
    // the separator between characters when several share a file.
    new Paragraph({
      children: [new TextRun({ text: 'Name: ', bold: true }), new TextRun('')],
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 2 } }
    })
  ]

  for (const section of sheet.sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 }
      })
    )
    for (const field of section.fields) {
      // Free-text sections (Trauma, Backstory) carry an unlabelled body field.
      if (!field.label) {
        children.push(new Paragraph({ text: '', spacing: { after: 400 } }))
        continue
      }
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${field.label}: `, bold: true }), new TextRun('')],
          spacing: { after: field.type === 'multiline' ? 240 : 100 }
        })
      )
    }
  }

  try {
    const doc = new Document({ sections: [{ children }] })
    writeFileSync(picked.filePath, await Packer.toBuffer(doc))
    return { path: picked.filePath }
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : String(e) }
  }
}
