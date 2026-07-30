import { BrowserWindow } from 'electron'

/**
 * Sends HTML to the system print dialog.
 *
 * Rendering into an offscreen window means printing uses the same engine as PDF
 * export, so a printed page and an exported one come out identical rather than
 * diverging over two code paths.
 */
export async function printHtml(html: string): Promise<{ ok: boolean; reason?: string }> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, javascript: false }
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const result = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        resolve(success ? { ok: true } : { ok: false, reason: failureReason })
      })
    })
    return result
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  } finally {
    // Give the print job a moment to hand off before tearing the window down.
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy()
    }, 1500)
  }
}

/** Renders the same print HTML to a PDF buffer, for on-screen preview. */
export async function previewHtml(html: string): Promise<ArrayBuffer | null> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false }
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { top: 1, bottom: 1, left: 1, right: 1 }
    })
    return pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
  } catch {
    return null
  } finally {
    win.destroy()
  }
}
