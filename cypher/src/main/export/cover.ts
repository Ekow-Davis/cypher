import { readFileSync, existsSync } from 'node:fs'
import { extname } from 'node:path'
import { absoluteAssetPath } from '../assets'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export interface CoverData {
  buffer: Buffer
  mime: string
  ext: string
  width: number
  height: number
}

/**
 * Reads intrinsic dimensions straight from the file header for PNG and JPEG.
 * Without this a cover would have to be stretched into a guessed box; knowing
 * the real aspect ratio lets every exporter scale it without distortion.
 * Anything else falls back to a 2:3 book-cover ratio.
 */
function sniffSize(buf: Buffer, ext: string): { width: number; height: number } {
  try {
    if (ext === '.png' && buf.length > 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    if ((ext === '.jpg' || ext === '.jpeg') && buf.length > 4) {
      let i = 2
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) {
          i++
          continue
        }
        const marker = buf[i + 1]
        // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
        }
        i += 2 + buf.readUInt16BE(i + 2)
      }
    }
  } catch {
    /* fall through to the default ratio */
  }
  return { width: 800, height: 1200 }
}

export function loadCover(coverPath: string | null): CoverData | null {
  if (!coverPath) return null
  try {
    const abs = absoluteAssetPath(coverPath)
    if (!existsSync(abs)) return null
    const ext = extname(abs).toLowerCase()
    const mime = MIME[ext]
    if (!mime) return null
    const buffer = readFileSync(abs)
    const { width, height } = sniffSize(buffer, ext)
    return { buffer, mime, ext, width, height }
  } catch {
    return null
  }
}

/** Fits a cover inside a box while preserving its aspect ratio. */
export function fitBox(
  cover: CoverData,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const scale = Math.min(maxW / cover.width, maxH / cover.height, 1)
  return { width: Math.round(cover.width * scale), height: Math.round(cover.height * scale) }
}
