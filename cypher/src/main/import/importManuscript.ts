import { dialog } from 'electron'
import { basename, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import mammoth from 'mammoth'
import { detectChapters, type DetectionResult } from './detectChapters'

/**
 * Turns a Word document or PDF into chapters.
 *
 * The file is converted to HTML first so both formats meet at one
 * representation, and the boundary detector only has to understand one thing.
 */

export interface ManuscriptImport extends DetectionResult {
  fileName: string
  /** Total words across every detected chapter, for the confirmation dialog. */
  totalWords: number
}

/**
 * Rebuilds paragraphs from a PDF's text layer.
 *
 * PDFs store positioned runs, not paragraphs, so the structure has to be
 * inferred: a line that ends without sentence punctuation is usually a wrap
 * and gets joined to the next, while a blank line or a short line ending in
 * punctuation starts a new paragraph.
 */
async function pdfToHtml(path: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(path))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise

  const lines: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let current = ''
    let lastY: number | null = null

    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (typeof item.str !== 'string') continue
      const y = item.transform[5]
      // A vertical jump means a new line in the source.
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (current.trim()) lines.push(current.trim())
        current = ''
      }
      current += item.str
      lastY = y
    }
    if (current.trim()) lines.push(current.trim())
  }

  const paragraphs: string[] = []
  let buffer = ''
  for (const line of lines) {
    if (!line) {
      if (buffer.trim()) paragraphs.push(buffer.trim())
      buffer = ''
      continue
    }
    const endsSentence = /[.!?]["')\]]?$/.test(line)
    const isShort = line.length < 60
    buffer = buffer ? `${buffer} ${line}` : line
    // A short line that closes a sentence is a paragraph end, not a wrap.
    if (endsSentence && isShort) {
      paragraphs.push(buffer.trim())
      buffer = ''
    }
  }
  if (buffer.trim()) paragraphs.push(buffer.trim())

  return paragraphs
    .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('\n')
}

export async function importManuscript(): Promise<ManuscriptImport | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Import a manuscript',
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['docx', 'pdf'] },
      { name: 'Word document', extensions: ['docx'] },
      { name: 'PDF', extensions: ['pdf'] }
    ]
  })
  if (picked.canceled || picked.filePaths.length === 0) return null

  const path = picked.filePaths[0]
  const ext = extname(path).toLowerCase()

  let html: string
  if (ext === '.pdf') {
    html = await pdfToHtml(path)
  } else {
    const result = await mammoth.convertToHtml(
      { path },
      {
        // Map Word's heading styles through, since they are the strongest
        // signal we have about where chapters begin.
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Title'] => h1:fresh"
        ],
        // Pictures are dropped: this path builds chapters, and a stray inline
        // image would land in whichever chapter the splitter happened to pick.
        convertImage: mammoth.images.imgElement(async () => ({ src: '' }))
      }
    )
    html = result.value
  }

  const detection = detectChapters(html)
  return {
    ...detection,
    fileName: basename(path, extname(path)),
    totalWords: detection.chapters.reduce((sum, c) => sum + c.words, 0)
  }
}
