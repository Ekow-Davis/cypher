import { createWriteStream } from 'node:fs'
import archiver from 'archiver'
import { randomUUID } from 'node:crypto'
import { contentToHtml, escapeHtml } from './tiptapToHtml'
import { loadCover } from './cover'
import type { ExportBook } from './gather'
import type { ExportOptions } from './types'

const CSS = `body{font-family:Georgia,serif;line-height:1.6;margin:1em}
h1{font-size:1.5em;margin:0 0 1em}p{margin:0 0 .7em;text-align:justify}
blockquote{margin:.8em 0 .8em 1.5em;font-style:italic}
.synopsis{font-style:italic;color:#555;margin-bottom:1.2em}
.mention{font-weight:600}`

interface Item {
  id: string
  file: string
  title: string
  html: string
}

function chapterDoc(title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title><link rel="stylesheet" href="style.css" type="text/css"/></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`
}

/**
 * Writes a minimal but valid EPUB 3 (with an NCX for older readers).
 * The mimetype entry must be first and stored uncompressed — that's what lets
 * a reader identify the file, so it's added before anything else with store:true.
 */
export async function exportEpub(
  data: ExportBook,
  options: ExportOptions,
  destination: string
): Promise<void> {
  const uuid = randomUUID()
  const cover = options.includeCover ? loadCover(data.book.cover_path) : null
  const items: Item[] = []
  let n = 0

  for (const group of data.groups) {
    if (options.volumeHeadings && group.volumeTitle) {
      n++
      items.push({
        id: `vol${n}`,
        file: `vol${n}.xhtml`,
        title: group.volumeTitle,
        html: chapterDoc(group.volumeTitle, '')
      })
    }
    for (const chapter of group.chapters) {
      n++
      const synopsis =
        options.includeSynopsis && chapter.synopsis
          ? `<p class="synopsis">${escapeHtml(chapter.synopsis)}</p>`
          : ''
      items.push({
        id: `ch${n}`,
        file: `ch${n}.xhtml`,
        title: chapter.title,
        html: chapterDoc(chapter.title, synopsis + contentToHtml(chapter.content))
      })
    }
  }

  const manifest = items
    .map((i) => `<item id="${i.id}" href="${i.file}" media-type="application/xhtml+xml"/>`)
    .join('\n    ')
  const spine = items.map((i) => `<itemref idref="${i.id}"/>`).join('\n    ')

  const coverManifest = cover
    ? `<item id="cover-image" href="cover${cover.ext}" media-type="${cover.mime}" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`
    : ''
  // EPUB 2 readers look for this meta; EPUB 3 uses properties="cover-image".
  const coverMeta = cover ? `<meta name="cover" content="cover-image"/>` : ''
  const coverSpine = cover ? `<itemref idref="cover" linear="yes"/>` : ''
  const coverDoc = cover
    ? `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>Cover</title>
<style>body{margin:0;text-align:center}img{max-width:100%;height:auto}</style></head>
<body><img src="cover${cover.ext}" alt="Cover"/></body></html>`
    : ''

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeHtml(data.book.title)}</dc:title>
    <dc:language>${escapeHtml(data.book.language || 'en')}</dc:language>
    ${options.author.trim() ? `<dc:creator>${escapeHtml(options.author.trim())}</dc:creator>` : ''}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    ${coverMeta}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${coverManifest}
    ${manifest}
  </manifest>
  <spine toc="ncx" page-progression-direction="ltr">
    ${coverSpine}
    ${spine}
  </spine>
</package>`

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${items.map((i) => `<li><a href="${i.file}">${escapeHtml(i.title)}</a></li>`).join('\n')}
</ol></nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden"><ol>
<li><a epub:type="bodymatter" href="${items[0]?.file ?? 'nav.xhtml'}">Start of content</a></li>
</ol></nav>
</body></html>`

  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:${uuid}"/></head>
  <docTitle><text>${escapeHtml(data.book.title)}</text></docTitle>
  <navMap>
${items
  .map(
    (i, idx) =>
      `    <navPoint id="np${idx + 1}" playOrder="${idx + 1}"><navLabel><text>${escapeHtml(
        i.title
      )}</text></navLabel><content src="${i.file}"/></navPoint>`
  )
  .join('\n')}
  </navMap>
</ncx>`

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(destination)
    const zip = archiver('zip', { zlib: { level: 9 } })
    out.on('close', () => resolve())
    out.on('error', reject)
    zip.on('error', reject)
    zip.pipe(out)

    // must be the first entry and uncompressed
    zip.append('application/epub+zip', { name: 'mimetype', store: true })
    zip.append(
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
      { name: 'META-INF/container.xml' }
    )
    zip.append(opf, { name: 'OEBPS/content.opf' })
    zip.append(nav, { name: 'OEBPS/nav.xhtml' })
    zip.append(ncx, { name: 'OEBPS/toc.ncx' })
    zip.append(CSS, { name: 'OEBPS/style.css' })
    if (cover) {
      zip.append(cover.buffer, { name: `OEBPS/cover${cover.ext}` })
      zip.append(coverDoc, { name: 'OEBPS/cover.xhtml' })
    }
    for (const i of items) zip.append(i.html, { name: `OEBPS/${i.file}` })
    void zip.finalize()
  })
}
