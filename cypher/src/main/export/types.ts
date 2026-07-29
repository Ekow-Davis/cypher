export type ExportFormat = 'docx' | 'pdf' | 'epub'

export interface ExportOptions {
  author: string
  titlePage: boolean
  includeCover: boolean
  volumeHeadings: boolean
  includeSynopsis: boolean
  /** When non-empty, only these chapters are exported, in manuscript order. */
  chapterIds: number[]
}
