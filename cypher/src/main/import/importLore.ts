import { dialog } from 'electron'
import { basename, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import mammoth from 'mammoth'
import type { LoreImportFile } from '../../shared/types'

/**
 * Reads Word, Markdown and plain-text files as lore entries.
 *
 * Everything meets at HTML, which the renderer then parses through the lore
 * editor's own schema — the same route the manuscript import takes — so an
 * imported entry opens exactly as it will be edited. Resolving `@References`
 * against the codex happens in the renderer too, where the entries live.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * `@Handles` survive Markdown's inline pass untouched.
 *
 * `@The_Crimson_Chapel` would otherwise have its underscores read as italics,
 * which both mangles the name and splits it across formatting runs so it can
 * no longer be matched.
 */
const HANDLE = /@[\p{L}\p{N}_'’-]+/gu

function inlineMarkdown(raw: string): string {
  const handles: string[] = []
  let text = raw.replace(HANDLE, (m) => {
    handles.push(m)
    return `\u0000${handles.length - 1}\u0000`
  })
  const codes: string[] = []
  text = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code)
    return `\u0001${codes.length - 1}\u0001`
  })

  text = escapeHtml(text)
  // Images carry no file here, so keep their alt text rather than a broken box.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>')
  text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
  text = text.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
  // Underscore emphasis only at word edges, as in CommonMark: snake_case stays.
  text = text.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>')
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')
  text = text.replace(/ {2,}\n|\\\n/g, '<br>')

  text = text.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => `<code>${escapeHtml(codes[+i])}</code>`)
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => escapeHtml(handles[+i]))
  return text
}

/**
 * A deliberately small Markdown reader: headings, paragraphs, emphasis,
 * links, quotes, lists, rules and fenced code — what notes and wiki exports
 * actually contain. Tables and footnotes come through as plain paragraphs.
 */
export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] | null = null

  const flushPara = (): void => {
    if (para.length) out.push(`<p>${inlineMarkdown(para.join('\n'))}</p>`)
    para = []
  }
  const flushList = (): void => {
    if (list) {
      out.push(
        `<${list.type}>${list.items.map((i) => `<li><p>${inlineMarkdown(i)}</p></li>`).join('')}</${list.type}>`
      )
    }
    list = null
  }
  const flushQuote = (): void => {
    if (quote) out.push(`<blockquote>${markdownToHtml(quote.join('\n'))}</blockquote>`)
    quote = null
  }
  const flushAll = (): void => {
    flushPara()
    flushList()
    flushQuote()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = line.match(/^\s*(```|~~~)/)
    if (fence) {
      flushAll()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }

    if (/^\s*>/.test(line)) {
      flushPara()
      flushList()
      ;(quote ??= []).push(line.replace(/^\s*>\s?/, ''))
      continue
    }
    if (quote) flushQuote()

    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (heading) {
      flushAll()
      // The editor offers three heading levels; deeper ones fold into h3.
      const level = Math.min(3, heading[1].length)
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    // Setext headings: a line underlined with === or ---.
    const next = lines[i + 1]
    if (para.length === 0 && next !== undefined && /^\s*(=+|-+)\s*$/.test(next) && !/^\s*[-*+]\s/.test(line)) {
      flushAll()
      const level = next.trim().startsWith('=') ? 1 : 2
      out.push(`<h${level}>${inlineMarkdown(line.trim())}</h${level}>`)
      i++
      continue
    }

    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll()
      out.push('<hr>')
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (bullet || ordered) {
      flushPara()
      const type = bullet ? 'ul' : 'ol'
      if (list && list.type !== type) flushList()
      ;(list ??= { type, items: [] }).items.push((bullet ?? ordered)![1])
      continue
    }

    // An indented line straight after a list item continues that item.
    if (list && /^\s{2,}\S/.test(line)) {
      const items = list.items
      items[items.length - 1] += ' ' + line.trim()
      continue
    }

    flushList()
    para.push(line)
  }
  flushAll()
  return out.join('\n')
}

function textToHtml(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

/**
 * Lifts a leading top-level heading out as the entry's title, so a file that
 * starts "# The Crimson Chapel" doesn't repeat its own name as the first line.
 */
function splitTitle(html: string, fallback: string): { title: string; html: string } {
  const match = html.match(/^\s*<h1>([\s\S]*?)<\/h1>\s*/)
  if (!match) return { title: fallback, html }
  const title = match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
  return title ? { title, html: html.slice(match[0].length) } : { title: fallback, html }
}

function wordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').trim()
  return text ? text.split(/\s+/).length : 0
}

async function readOne(path: string): Promise<LoreImportFile> {
  const ext = extname(path).toLowerCase()
  const fileName = basename(path)
  // "the_crimson_chapel.md" reads better as "the crimson chapel".
  const fallbackTitle = basename(path, extname(path)).replace(/[_]+/g, ' ').trim() || 'Untitled'

  try {
    let html: string
    if (ext === '.docx') {
      const result = await mammoth.convertToHtml(
        { path },
        {
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh"
          ],
          // Lore entries hold text; a picture would arrive as an empty box.
          convertImage: mammoth.images.imgElement(async () => ({ src: '' }))
        }
      )
      html = result.value.replace(/<img[^>]*>/g, '')
    } else if (ext === '.md' || ext === '.markdown') {
      html = markdownToHtml(await readFile(path, 'utf8'))
    } else {
      html = textToHtml(await readFile(path, 'utf8'))
    }
    const { title, html: body } = splitTitle(html, fallbackTitle)
    return { fileName, title, html: body, words: wordCount(body) }
  } catch (e) {
    return {
      fileName,
      title: fallbackTitle,
      html: '',
      words: 0,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export async function pickLoreFiles(): Promise<LoreImportFile[] | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Import lore entries',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents', extensions: ['docx', 'md', 'markdown', 'txt'] },
      { name: 'Word document', extensions: ['docx'] },
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'Plain text', extensions: ['txt'] }
    ]
  })
  if (picked.canceled || picked.filePaths.length === 0) return null
  return Promise.all(picked.filePaths.map(readOne))
}
