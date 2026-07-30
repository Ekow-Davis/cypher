import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/* eslint-disable @typescript-eslint/no-explicit-any */
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * PDFs have no cover image, so the first page becomes one. This runs in the
 * renderer because rasterising a page needs a canvas — the main process has
 * neither, and shipping a headless renderer just for thumbnails isn't worth it.
 */
export async function enrichPdf(id: number): Promise<boolean> {
  let pdf: any = null
  try {
    const buf = await window.cypher.reader.fileData(id)
    if (!buf) return false
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise

    // Title / author from the document info dictionary, when present.
    try {
      const info = (await pdf.getMetadata())?.info ?? {}
      const title = typeof info.Title === 'string' ? info.Title.trim() : ''
      const author = typeof info.Author === 'string' ? info.Author.trim() : ''
      if (title) await window.cypher.reader.rename(id, title)
      if (author) await window.cypher.reader.setAuthor(id, author)
    } catch {
      /* metadata is optional */
    }

    // First page -> cover.
    const page = await pdf.getPage(1)
    const unit = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(2, 720 / unit.width) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    )
    if (!blob) return false
    await window.cypher.reader.setCoverFromImage(id, await blob.arrayBuffer(), '.png')
    return true
  } catch (e) {
    console.warn('[pdfMeta] enrichment failed', e)
    return false
  } finally {
    try {
      pdf?.destroy?.()
    } catch {
      /* ignore */
    }
  }
}
