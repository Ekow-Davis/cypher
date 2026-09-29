/**
 * Font families offered in the pickers. Built-ins are ones Windows ships, so
 * they work without anything installed; the user's font library is appended
 * by the caller.
 */
export interface FontChoice {
  label: string
  value: string
}

export const WRITING_FONTS: FontChoice[] = [
  { label: 'Default (Georgia)', value: '' },
  { label: 'Book serif (Cambria)', value: "Cambria, Georgia, serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Palatino', value: "'Palatino Linotype', Palatino, serif" },
  { label: 'System sans', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Verdana (very legible)', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Monospace', value: "'Courier New', Courier, monospace" }
]

export const UI_FONTS: FontChoice[] = [
  { label: 'Default (system)', value: '' },
  { label: 'Segoe UI', value: "'Segoe UI', system-ui, sans-serif" },
  { label: 'Verdana (very legible)', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' }
]

/** Library fonts as picker entries — quoted, since family names can hold spaces. */
export function libraryChoices(library: { id: string; family: string }[]): FontChoice[] {
  return library.map((f) => ({ label: f.family, value: `'${f.family}'` }))
}
