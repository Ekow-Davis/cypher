import { getDb } from '../index'
import type { DocComment, CreateCommentInput } from '@shared/types'

export function listComments(documentId: number): DocComment[] {
  return getDb()
    .prepare('SELECT * FROM doc_comments WHERE document_id = ? ORDER BY created_at ASC, id ASC')
    .all(documentId) as DocComment[]
}

function getComment(id: number): DocComment | null {
  return (getDb().prepare('SELECT * FROM doc_comments WHERE id = ?').get(id) as DocComment) ?? null
}

export function createComment(input: CreateCommentInput): DocComment {
  const info = getDb()
    .prepare(
      'INSERT INTO doc_comments (document_id, anchor, author, body, quote) VALUES (?, ?, ?, ?, ?)'
    )
    .run(input.documentId, input.anchor, input.author, input.body, input.quote ?? null)
  return getComment(Number(info.lastInsertRowid)) as DocComment
}

export function updateComment(id: number, body: string): DocComment | null {
  getDb().prepare('UPDATE doc_comments SET body = ? WHERE id = ?').run(body, id)
  return getComment(id)
}

export function resolveComment(id: number, resolved: boolean): DocComment | null {
  getDb().prepare('UPDATE doc_comments SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id)
  return getComment(id)
}

export function deleteComment(id: number): void {
  getDb().prepare('DELETE FROM doc_comments WHERE id = ?').run(id)
}
