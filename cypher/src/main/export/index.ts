import { dialog } from 'electron'
import { gatherBook } from './gather'
import { exportDocx } from './exportDocx'
import { exportPdf } from './exportPdf'
import { exportEpub } from './exportEpub'
import { gatherSection } from './sectioned'
import { exportSectionDocx, exportSectionPdf } from './exportSection'
import type { SectionKind, SectionExportOptions, ExportResult } from '@shared/types'
import type { ExportFormat, ExportOptions } from './types'

export type { ExportFormat, ExportOptions }

const FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  docx: { name: 'Word document', extensions: ['docx'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
  epub: { name: 'EPUB', extensions: ['epub'] }
}

function safeName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled'
}

// Declared in shared/types so the renderer sees the identical shape.
export type { ExportResult } from '@shared/types'

export async function exportBook(
  bookId: number,
  format: ExportFormat,
  options: ExportOptions
): Promise<ExportResult> {
  const data = gatherBook(bookId, options.chapterIds)
  if (!data) return { path: null, chapters: 0, error: 'Book not found.' }
  if (!data.chapters.length) {
    return { path: null, chapters: 0, error: 'No chapters selected to export.' }
  }

  const result = await dialog.showSaveDialog({
    title: `Export as ${format.toUpperCase()}`,
    defaultPath: `${safeName(data.book.title)}.${format}`,
    filters: [FILTERS[format]]
  })
  if (result.canceled || !result.filePath) {
    return { path: null, chapters: 0, cancelled: true }
  }

  try {
    if (format === 'docx') await exportDocx(data, options, result.filePath)
    else if (format === 'pdf') await exportPdf(data, options, result.filePath)
    else await exportEpub(data, options, result.filePath)
    return { path: result.filePath, chapters: data.chapters.length }
  } catch (e) {
    return {
      path: null,
      chapters: 0,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

/** Exports the codex or the cast on its own — Word or PDF, no EPUB. */
export async function exportSection(
  bookId: number,
  kind: SectionKind,
  format: 'docx' | 'pdf',
  options: SectionExportOptions
): Promise<ExportResult> {
  const doc = gatherSection(bookId, kind, options.ids, options.includeEmptyFields)
  if (!doc) return { path: null, chapters: 0, error: 'Book not found.' }
  if (!doc.count) {
    return { path: null, chapters: 0, error: 'Nothing selected to export.' }
  }

  const result = await dialog.showSaveDialog({
    title: `Export ${kind === 'lore' ? 'lore' : 'characters'} as ${format.toUpperCase()}`,
    defaultPath: `${safeName(doc.docTitle)}.${format}`,
    filters: [FILTERS[format]]
  })
  if (result.canceled || !result.filePath) return { path: null, chapters: 0, cancelled: true }

  try {
    if (format === 'docx') await exportSectionDocx(doc, options, result.filePath)
    else await exportSectionPdf(doc, options, result.filePath)
    return { path: result.filePath, chapters: doc.count }
  } catch (e) {
    return { path: null, chapters: 0, error: e instanceof Error ? e.message : String(e) }
  }
}
