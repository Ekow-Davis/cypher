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
  author: string | null
  language: string
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
  author?: string | null
  language?: string
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
  progress: number // 0–1
  last_read_at: string | null
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

export type TrashKind = 'book' | 'chapter' | 'lore' | 'character' | 'document'

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

export type MarkKind = 'bookmark' | 'highlight'

export interface ReaderMark {
  id: number
  item_id: number
  kind: MarkKind
  location: string
  label: string | null
  excerpt: string | null
  note: string | null
  color: string | null
  rects: string | null // JSON [[x,y,w,h], …] as fractions of the page (PDF only)
  created_at: string
}

export interface CreateMarkInput {
  itemId: number
  kind: MarkKind
  location: string
  label?: string | null
  excerpt?: string | null
  note?: string | null
  color?: string | null
  rects?: string | null
}

export interface UpdateMarkInput {
  note?: string | null
  color?: string | null
}

export type SectionKind = 'lore' | 'characters'

export interface SectionExportOptions {
  author: string
  titlePage: boolean
  tableOfContents: boolean
  groupHeadings: boolean
  includeEmptyFields: boolean
  includePortraits: boolean
  ids: number[]
}

export interface Doc {
  id: number
  title: string
  content: string // Tiptap document JSON (stringified)
  header: string
  footer: string
  header_align: RunningAlign
  footer_align: RunningAlign
  created_at: string
  updated_at: string
}

export type RunningAlign = 'left' | 'center' | 'right'

export interface UpdateDocMetaInput {
  header?: string
  footer?: string
  header_align?: RunningAlign
  footer_align?: RunningAlign
}

export interface DocComment {
  id: number
  document_id: number
  anchor: string
  author: string
  body: string
  quote: string | null
  resolved: number
  created_at: string
}

export interface CreateCommentInput {
  documentId: number
  anchor: string
  author: string
  body: string
  quote?: string | null
}

export interface DiarySecurityStatus {
  configured: boolean
  locked: boolean
  lockedUntil: string | null
  failCount: number
}

export interface Diary {
  id: number
  name: string
  created_at: string
  sort_order: number
}

export interface DiaryEntry {
  id: number
  diary_id: number | null // null = standalone "vent" entry
  entry_number: number | null
  title: string // plaintext once unlocked; the DB row holds ciphertext
  content: string
  created_at: string
  updated_at: string
  month_group: string | null
  sort_order: number
}

export interface CreateEntryInput {
  diaryId: number | null
  title: string
  content: string
}

export interface ShareScope {
  /** Empty means the whole book. */
  chapterIds: number[]
  includeCover: boolean
  includeSynopsis: boolean
}

export interface ShareLink {
  id: number
  book_id: number
  token: string | null
  label: string
  scope_json: string
  expires_at: string | null
  active: number
  created_at: string
  last_published_at: string | null
  views: number
  read_seconds: number
}

export interface CreateShareInput {
  bookId: number
  label: string
  scope: ShareScope
  expiresAt: string | null
}

/** The frozen payload a reader receives — books only, never diary content. */
export interface ShareSnapshot {
  title: string
  subtitle: string | null
  author: string | null
  language: string
  coverDataUri: string | null
  builtAt: string
  chapters: {
    id: number
    title: string
    volume: string | null
    synopsis: string | null
    html: string
    words: number
  }[]
}

export interface SplitChapterInput {
  id: number
  /** Content that stays in the original chapter. */
  firstContent: string
  firstWordCount: number
  /** Content that moves into the new chapter. */
  secondTitle: string
  secondContent: string
  secondWordCount: number
}

export interface ImportedChapterInput {
  title: string
  content: string
  wordCount: number
}

export interface DetectedChapter {
  title: string
  html: string
  words: number
}

export interface ManuscriptImport {
  mode: 'headings' | 'patterns' | 'none'
  chapters: DetectedChapter[]
  fileName: string
  totalWords: number
}
