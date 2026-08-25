import { dialog } from 'electron'
import { basename, extname } from 'node:path'
import mammoth from 'mammoth'
import { defaultCharacterSheet } from '@shared/characterTemplate'
import type { CharacterSheet } from '@shared/types'

/**
 * Reads filled-in character sheets back out of Word documents.
 *
 * Fields are matched on their labels, which is why the exported template tells
 * the writer to leave those alone. Anything unrecognised is ignored rather than
 * guessed at, and a blank field simply stays blank — an import should never
 * invent content.
 */

export interface ImportedCharacter {
  name: string
  sheet: CharacterSheet
  /** How many template fields were actually filled, for the review dialog. */
  filled: number
}

export interface CharacterImportResult {
  fileName: string
  characters: ImportedCharacter[]
  /** Labels found in the file that don't exist in the template. */
  unknownLabels: string[]
}

function normalise(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function stripTags(html: string): string {
  return html
    // Only block boundaries are line breaks. Inline tags must not be, because
    // a template line is "<strong>Label: </strong>value" inside one <p> —
    // breaking on every tag would split every label from its own answer.
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

/** Splits "Label: value" lines, tolerating the colon variants Word produces. */
function parseLine(line: string): { label: string; value: string } | null {
  const match = line.match(/^\s*([^:：]{1,60})\s*[:：]\s*(.*)$/)
  if (!match) return null
  return { label: match[1].trim(), value: match[2].trim() }
}

export async function importCharacterSheets(): Promise<CharacterImportResult | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Import character sheets',
    properties: ['openFile'],
    filters: [{ name: 'Word document', extensions: ['docx'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return null

  const path = picked.filePaths[0]
  const { value: html } = await mammoth.convertToHtml({ path })
  const lines = stripTags(html)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // A label lookup built from the template, so matching stays in step with it.
  const template = defaultCharacterSheet()
  const lookup = new Map<string, { sectionId: string; fieldId: string }>()
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.label) {
        lookup.set(normalise(field.label), { sectionId: section.id, fieldId: field.id })
      }
    }
  }

  const characters: ImportedCharacter[] = []
  const unknownLabels = new Set<string>()
  let current: ImportedCharacter | null = null
  let freeSection: string | null = null

  const startCharacter = (name: string): void => {
    current = { name: name || 'Unnamed character', sheet: defaultCharacterSheet(), filled: 0 }
    characters.push(current)
    freeSection = null
  }

  for (const line of lines) {
    const parsed = parseLine(line)

    // "Name:" opens a new character, which is what allows several per file.
    if (parsed && normalise(parsed.label) === 'name') {
      startCharacter(parsed.value)
      continue
    }
    if (!current) {
      // Content before any Name: line — start an unnamed character for it.
      if (!parsed && !/character sheet|cypher character/i.test(line)) continue
      if (parsed) startCharacter('')
      else continue
    }

    // Section headings switch the target for free-text blocks.
    const asSection = template.sections.find(
      (s) => normalise(s.title) === normalise(line) && s.fields.some((f) => !f.label)
    )
    if (asSection) {
      freeSection = asSection.id
      continue
    }
    if (template.sections.some((s) => normalise(s.title) === normalise(line))) {
      freeSection = null
      continue
    }

    if (parsed) {
      const target = lookup.get(normalise(parsed.label))
      if (!target) {
        if (parsed.value) unknownLabels.add(parsed.label)
        continue
      }
      if (!parsed.value) continue
      const section = current!.sheet.sections.find((s) => s.id === target.sectionId)
      const field = section?.fields.find((f) => f.id === target.fieldId)
      if (field) {
        field.value = parsed.value
        current!.filled += 1
      }
      continue
    }

    // Unlabelled prose belongs to whichever free-text section is open.
    if (freeSection) {
      const section = current!.sheet.sections.find((s) => s.id === freeSection)
      const body = section?.fields.find((f) => !f.label)
      if (body) {
        body.value = body.value ? `${body.value}\n${line}` : line
        if (body.value === line) current!.filled += 1
      }
    }
  }

  return {
    fileName: basename(path, extname(path)),
    characters: characters.filter((c) => c.filled > 0 || c.name !== 'Unnamed character'),
    unknownLabels: [...unknownLabels]
  }
}
