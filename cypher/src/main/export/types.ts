export type ExportFormat = 'docx' | 'pdf' | 'epub'

export interface ExportOptions {
  titlePage: boolean
  volumeHeadings: boolean
  includeSynopsis: boolean
}
