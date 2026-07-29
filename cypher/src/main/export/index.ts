import { dialog } from 'electron'
import { gatherBook } from './gather'
import { exportDocx } from './exportDocx'
import { exportPdf } from './exportPdf'
import { exportEpub } from './exportEpub'
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

export interface ExportResult {
  path: string | null
  chapters: number
  cancelled?: boolean
  error?: string
}

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
