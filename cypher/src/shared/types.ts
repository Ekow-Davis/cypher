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

export type ChapterStatus = 'outline' | 'draft' | 'revised' | 'final'

export interface Chapter {
  id: number
  book_id: number
  volume_id: number | null
  title: string
  content: string // Tiptap document JSON (stringified)
  word_count: number
  sort_order: number
  updated_at: string
  synopsis: string
  status: ChapterStatus
  pov_character_id: number | null
}

export interface UpdateChapterMetaInput {
  synopsis?: string
  status?: ChapterStatus
  pov_character_id?: number | null
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

export interface Goal {
  id: number
  owner_type: string
  owner_id: number
  target_words: number
  deadline: string | null
  writing_days: string // JSON array of weekday indices
}

export interface Checkin {
  id: number
  owner_type: string
  owner_id: number
  date: string // YYYY-MM-DD (local)
  mood: string | null
  note: string | null
  words_written: number
  words_deleted: number
  total_words: number
  day_start_words: number | null
}

export interface LoreEntry {
  id: number
  book_id: number
  title: string
  content: string // Tiptap document JSON (stringified)
  category: string
  sort_order: number
}

export interface CreateLoreOptions {
  title?: string
  category?: string
}

export interface Character {
  id: number
  book_id: number
  folder: string | null
  name: string
  image_path: string | null
  fields_json: string
}

export type FieldType = 'text' | 'multiline'

export interface CharacterField {
  id: string
  label: string
  value: string
  type: FieldType
}

export interface CharacterSection {
  id: string
  title: string
  fields: CharacterField[]
}

export interface CharacterSheet {
  sections: CharacterSection[]
}

export interface CreateCharacterOptions {
  name?: string
  folder?: string | null
}

export type ReaderFormat = 'epub' | 'pdf'

export interface ReaderItem {
  id: number
  title: string
  author: string | null
  format: ReaderFormat
  file_path: string
  cover_path: string | null
  source_path: string | null
  last_location: string | null
  added_at: string
  abs_path?: string // absolute path on disk, enriched by main for display
}

export interface ReaderImportResult {
  item: ReaderItem
  sourcePath: string
}

export interface Note {
  id: number
  owner_type: string
  owner_id: number
  slot: number
  title: string
  content: string
  color: string | null
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  color?: string | null
}

export interface BackupInfo {
  name: string
  path: string
  size: number
  createdAt: string
}

export type ArchiveCadence = 'off' | 'weekly' | 'monthly'

export type TrashKind = 'book' | 'chapter' | 'lore' | 'character'

export interface TrashItem {
  kind: TrashKind
  id: number
  title: string
  context: string | null
  deleted_at: string
}

export type ExportFormat = 'docx' | 'pdf' | 'epub'

export interface ExportOptions {
  author: string
  titlePage: boolean
  includeCover: boolean
  volumeHeadings: boolean
  includeSynopsis: boolean
  tableOfContents: boolean
  /** When non-empty, only these chapters are exported, in manuscript order. */
  chapterIds: number[]
}

export interface ExportResult {
  path: string | null
  chapters: number
  cancelled?: boolean
  error?: string
}
