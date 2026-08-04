/**
 * Export option types.
 *
 * Re-exported from the shared types rather than declared again here: these
 * cross the IPC boundary, so the renderer and main must agree exactly. Two
 * parallel definitions silently drift the moment one side gains a field, which
 * is precisely what happened with `tableOfContents`.
 */
export type { ExportFormat, ExportOptions, SectionKind, SectionExportOptions } from '@shared/types'
