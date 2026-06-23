/** Types shared across the main process and the renderer. */

export type BookStatus = 'draft' | 'ongoing' | 'complete'

export interface Book {
  id: number
  title: string
  subtitle: string | null
  synopsis: string | null
  genre: string | null
  status: BookStatus
  cover_path: string | null // relative ref under app-data assets, e.g. "covers/uuid.png"
  created_at: string
  archived: number // SQLite has no boolean: 0 | 1
}

export interface CreateBookInput {
  title: string
  subtitle?: string | null
}

export interface UpdateBookInput {
  title?: string
  subtitle?: string | null
  synopsis?: string | null
  genre?: string | null
  status?: BookStatus
  cover_path?: string | null
}

export interface Chapter {
  id: number
  book_id: number
  volume_id: number | null
  title: string
  content: string // Tiptap document JSON (stringified)
  word_count: number
  sort_order: number
  updated_at: string
}

export interface Volume {
  id: number
  book_id: number
  title: string
  sort_order: number
}

export interface ChapterPlacement {
  id: number
  volumeId: number | null
  sortOrder: number
}

export interface CreateChapterOptions {
  title?: string
  volumeId?: number | null
}
