/**
 * Header and footer templates.
 *
 * The same string drives the editor's on-screen sheets and Chromium's print
 * engine — the placeholders are simply substituted differently. Keeping one
 * definition means a footer can't read one way on screen and another on paper.
 */
export const PLACEHOLDERS = ['{page}', '{pages}', '{title}', '{date}'] as const

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

/** Chromium fills these spans itself while paginating. */
export function toPrintTemplate(
  template: string,
  title: string,
  align: 'left' | 'center' | 'right' = 'center'
): string {
  if (!template.trim()) return '<span></span>'
  const html = escapeHtml(template)
    .replace(/\{page\}/g, '<span class="pageNumber"></span>')
    .replace(/\{pages\}/g, '<span class="totalPages"></span>')
    .replace(/\{title\}/g, escapeHtml(title))
    .replace(/\{date\}/g, '<span class="date"></span>')
  // A flex row with space-between pushed each fragment to an edge, which is why
  // "Page 4 of 6" came out spread across the page. Plain text with text-align
  // keeps it as one phrase.
  return `<div style="width:100%;font-family:Georgia,serif;font-size:9pt;color:#444;padding:0 0.7in;text-align:${align};">${html}</div>`
}

export function hasRunningText(header: string, footer: string): boolean {
  return Boolean(header.trim() || footer.trim())
}
