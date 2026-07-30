import { getDb } from '../index'
import type { Doc } from '@shared/types'

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

export function duplicateDocument(id: number): Doc | null {
  const source = getDocument(id)
  if (!source) return null
  const info = getDb()
    .prepare('INSERT INTO documents (title, content) VALUES (?, ?)')
    .run(`${source.title} (copy)`, source.content)
  return getDocument(Number(info.lastInsertRowid))
}

export function deleteDocument(id: number): void {
  getDb().prepare('DELETE FROM documents WHERE id = ?').run(id)
}
