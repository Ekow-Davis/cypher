import { dialog } from 'electron'
import { basename, extname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import mammoth from 'mammoth'
import { assetsRoot } from './assets'

export interface ImportedDocx {
  title: string
  html: string
  warnings: number
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/tiff': '.tif',
  'image/x-emf': '.emf'
}

/**
 * Converts a .docx into HTML that Tiptap can parse directly.
 *
 * Embedded pictures are written into app storage and referenced through the
 * asset protocol rather than inlined as base64 — the same treatment images get
 * when inserted by hand, so an imported document doesn't bloat the database or
 * every subsequent backup.
 */
export async function importDocx(): Promise<ImportedDocx | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Import a Word document',
    properties: ['openFile'],
    filters: [{ name: 'Word document', extensions: ['docx'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return null

  const path = picked.filePaths[0]
  const dir = join(assetsRoot(), 'doc-images')
  mkdirSync(dir, { recursive: true })

  const result = await mammoth.convertToHtml(
    { path },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const buffer = await image.read()
        const ext = EXT_BY_MIME[image.contentType] ?? '.png'
        const name = `${randomUUID()}${ext}`
        writeFileSync(join(dir, name), buffer)
        return { src: `cypher-asset://local/doc-images/${name}` }
      }),
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Quote'] => blockquote:fresh"
      ]
    }
  )

  return {
    title: basename(path, extname(path)),
    html: result.value,
    warnings: result.messages.length
  }
}
