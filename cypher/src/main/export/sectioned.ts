import { listLore } from '../db/repositories/lore'
import { listCharacters } from '../db/repositories/characters'
import { getBook } from '../db/repositories/books'
import { contentToHtml, contentToBlocks, escapeHtml, type Block } from './tiptapToHtml'
import type { CharacterSheet, SectionKind } from '@shared/types'

export interface SectionEntry {
  id: number
  title: string
  html: string
  blocks: Block[]
  imagePath: string | null
}
export interface SectionGroup {
  title: string
  entries: SectionEntry[]
}
export interface SectionedDoc {
  kind: SectionKind
  bookTitle: string
  docTitle: string
  groups: SectionGroup[]
  count: number
}

/** Renders a character sheet as prose blocks and HTML, skipping blanks. */
function sheetToContent(
  fieldsJson: string,
  includeEmpty: boolean
): { html: string; blocks: Block[] } {
  let sheet: CharacterSheet | null = null
  try {
    const parsed = JSON.parse(fieldsJson)
    if (parsed && Array.isArray(parsed.sections)) sheet = parsed
  } catch {
    sheet = null
  }
  if (!sheet) return { html: '', blocks: [] }

  const htmlParts: string[] = []
  const blocks: Block[] = []

  for (const section of sheet.sections) {
    const fields = section.fields.filter((f) => includeEmpty || f.value.trim())
    if (!fields.length) continue

    htmlParts.push(`<h2>${escapeHtml(section.title)}</h2>`)
    blocks.push({ kind: 'heading', level: 2, runs: [{ text: section.title, bold: true }] })

    for (const field of fields) {
      const value = field.value.trim()
      if (field.label) {
        htmlParts.push(
          `<p><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(value)}</p>`
        )
        blocks.push({
          kind: 'paragraph',
          runs: [{ text: `${field.label}: `, bold: true }, { text: value }]
        })
      } else {
        // free-form block (Trauma, Backstory)
        for (const para of value.split(/\n{2,}/)) {
          htmlParts.push(`<p>${escapeHtml(para)}</p>`)
          blocks.push({ kind: 'paragraph', runs: [{ text: para }] })
        }
      }
    }
  }
  return { html: htmlParts.join('\n'), blocks }
}

/**
 * Builds a grouped document from either the codex or the cast. Both are
 * "groups of entries", so one model feeds both the Word and PDF writers.
 */
export function gatherSection(
  bookId: number,
  kind: SectionKind,
  ids: number[],
  includeEmptyFields: boolean
): SectionedDoc | null {
  const book = getBook(bookId)
  if (!book) return null
  const keep = ids.length ? new Set(ids) : null
  const map = new Map<string, SectionEntry[]>()

  if (kind === 'lore') {
    for (const e of listLore(bookId)) {
      if (keep && !keep.has(e.id)) continue
      const group = e.category || 'General'
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push({
        id: e.id,
        title: e.title,
        html: contentToHtml(e.content),
        blocks: contentToBlocks(e.content),
        imagePath: null
      })
    }
  } else {
    for (const c of listCharacters(bookId)) {
      if (keep && !keep.has(c.id)) continue
      const group = c.folder?.trim() || 'Unfiled'
      if (!map.has(group)) map.set(group, [])
      const { html, blocks } = sheetToContent(c.fields_json, includeEmptyFields)
      map.get(group)!.push({
        id: c.id,
        title: c.name,
        html,
        blocks,
        imagePath: c.image_path
      })
    }
  }

  const groups: SectionGroup[] = [...map.entries()]
    .sort((a, b) => {
      if (a[0] === 'Unfiled') return 1
      if (b[0] === 'Unfiled') return -1
      return a[0].localeCompare(b[0])
    })
    .map(([title, entries]) => ({ title, entries }))

  return {
    kind,
    bookTitle: book.title,
    docTitle: kind === 'lore' ? `${book.title} — Lore` : `${book.title} — Characters`,
    groups,
    count: groups.reduce((n, g) => n + g.entries.length, 0)
  }
}
