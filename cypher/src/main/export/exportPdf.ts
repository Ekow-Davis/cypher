import { BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { bookToHtml } from './bookHtml'
import type { ExportBook } from './gather'
import type { ExportOptions } from './types'

/**
 * Renders the book in an offscreen window and prints it with Chromium's own
 * PDF engine — the same layout engine the app already uses, so pagination and
 * typography match what the HTML describes without a separate PDF toolchain.
 */
export async function exportPdf(
  data: ExportBook,
  options: ExportOptions,
  destination: string
): Promise<void> {
  const html = bookToHtml(data, options)
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false }
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.8, bottom: 0.8, left: 0.7, right: 0.7 }
    })
    writeFileSync(destination, pdf)
  } finally {
    win.destroy()
  }
}
