import { getDb } from '../index'
import type { Doc, UpdateDocMetaInput } from '@shared/types'

/** Standalone documents — the word-processor side, unrelated to books. */

export function listDocuments(): Doc[] {
  return getDb().prepare('SELECT * FROM documents ORDER BY updated_at DESC, id DESC').all() as Doc[]
}

export function getDocument(id: number): Doc | null {
  return (getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as Doc) ?? null
}

export function createDocument(title?: string): Doc {
  const info = getDb()
    .prepare('INSERT INTO documents (title) VALUES (?)')
    .run(title?.trim() || 'Untitled document')
  return getDocument(Number(info.lastInsertRowid)) as Doc
}

export function renameDocument(id: number, title: string): Doc | null {
  getDb()
    .prepare("UPDATE documents SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title.trim() || 'Untitled document', id)
  return getDocument(id)
}

export function saveDocumentContent(id: number, content: string): Doc | null {
  getDb()
    .prepare("UPDATE documents SET content = ?, updated_at = datetime('now') WHERE id = ?")
    .run(content, id)
  return getDocument(id)
}

const META_FIELDS = ['header', 'footer', 'header_align', 'footer_align'] as const

export function updateDocumentMeta(id: number, patch: UpdateDocMetaInput): Doc | null {
  const entries = Object.entries(patch).filter(([k]) =>
    (META_FIELDS as readonly string[]).includes(k)
  )
  if (!entries.length) return getDocument(id)
  const sets = entries.map(([k]) => `${k} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE documents SET ${sets} WHERE id = ?`)
    .run(...entries.map(([, v]) => v as string), id)
  return getDocument(id)
}

export function duplicateDocument(id: number): Doc | null {
  const source = getDocument(id)
  if (!source) return null
  const info = getDb()
    .prepare('INSERT INTO documents (title, content, header, footer) VALUES (?, ?, ?, ?)')
    .run(`${source.title} (copy)`, source.content, source.header, source.footer)
  return getDocument(Number(info.lastInsertRowid))
}

export function deleteDocument(id: number): void {
  getDb().prepare('DELETE FROM documents WHERE id = ?').run(id)
}
