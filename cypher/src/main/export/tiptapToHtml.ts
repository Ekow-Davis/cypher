/**
 * Minimal Tiptap/ProseMirror JSON -> HTML renderer for export.
 * Covers what StarterKit produces plus character mentions. Unknown nodes fall
 * back to rendering their children, so an unhandled type loses formatting but
 * never loses the text.
 */

interface Mark {
  type: string
  attrs?: Record<string, unknown>
}
interface Node {
  type?: string
  text?: string
  marks?: Mark[]
  attrs?: Record<string, unknown>
  content?: Node[]
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

function applyMarks(text: string, marks?: Mark[]): string {
  let out = escapeHtml(text)
  for (const m of marks ?? []) {
    switch (m.type) {
      case 'bold':
        out = `<strong>${out}</strong>`
        break
      case 'italic':
        out = `<em>${out}</em>`
        break
      case 'strike':
        out = `<s>${out}</s>`
        break
      case 'code':
        out = `<code>${out}</code>`
        break
      case 'underline':
        out = `<u>${out}</u>`
        break
      default:
        break
    }
  }
  return out
}

function renderNodes(nodes: Node[] | undefined): string {
  return (nodes ?? []).map(renderNode).join('')
}

function renderNode(node: Node): string {
  if (node.type === 'text') return applyMarks(node.text ?? '', node.marks)

  switch (node.type) {
    case 'paragraph': {
      const inner = renderNodes(node.content)
      return inner.trim() ? `<p>${inner}</p>` : '<p>&#160;</p>'
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)))
      return `<h${level}>${renderNodes(node.content)}</h${level}>`
    }
    case 'blockquote':
      return `<blockquote>${renderNodes(node.content)}</blockquote>`
    case 'bulletList':
      return `<ul>${renderNodes(node.content)}</ul>`
    case 'orderedList':
      return `<ol>${renderNodes(node.content)}</ol>`
    case 'listItem':
      return `<li>${renderNodes(node.content)}</li>`
    case 'codeBlock':
      return `<pre><code>${escapeHtml(plainText(node))}</code></pre>`
    case 'horizontalRule':
      return '<hr/>'
    case 'hardBreak':
      return '<br/>'
    case 'mention':
      return `<span class="mention">${escapeHtml(String(node.attrs?.label ?? ''))}</span>`
    case 'pageBreak':
      // print styles turn this into a real break-after: page
      return '<div data-page-break="true"></div>'
    case 'footnote':
      // numbering is filled in by collectFootnotes, which knows document order
      return '<sup class="footnote-ref" data-footnote="1"></sup>'
    case 'caption': {
      const label = `${node.attrs?.kind === 'table' ? 'Table' : 'Figure'} ${node.attrs?._n ?? ''}`.trim()
      return `<p class="caption-block"><strong>${escapeHtml(label)}.</strong> ${renderNodes(node.content)}</p>`
    }
    case 'crossref':
      return `<span class="crossref">${escapeHtml(String(node.attrs?._resolved ?? node.attrs?.display ?? '?'))}</span>`
    case 'toc': {
      const entries = (node.attrs?.entries ?? []) as {
        text: string
        level: number
        page: number
      }[]
      const rows = entries
        .map(
          (e) =>
            `<div class="toc-row toc-level-${e.level}"><span class="toc-text">${escapeHtml(
              e.text
            )}</span><span class="toc-dots"></span><span class="toc-page">${e.page}</span></div>`
        )
        .join('')
      return `<div class="toc-block"><div class="toc-title">${escapeHtml(
        String(node.attrs?.title ?? 'Contents')
      )}</div>${rows}</div>`
    }
    default:
      return renderNodes(node.content)
  }
}

export function plainText(node: Node): string {
  const parts: string[] = []
  const walk = (n: Node): void => {
    if (n.text) parts.push(n.text)
    n.content?.forEach(walk)
  }
  walk(node)
  return parts.join('')
}

/** Parses stringified Tiptap content and renders it as HTML body markup. */
export function contentToHtml(stored: string): string {
  if (!stored) return ''
  let doc: Node
  try {
    doc = JSON.parse(stored) as Node
  } catch {
    return `<p>${escapeHtml(stored)}</p>`
  }
  return renderNodes(doc.content)
}

/** Block-level structure used by the docx exporter. */
export interface Block {
  kind: 'paragraph' | 'heading' | 'quote' | 'bullet' | 'ordered' | 'code' | 'pagebreak'
  level?: number
  runs: {
    text: string
    bold?: boolean
    italic?: boolean
    strike?: boolean
    code?: boolean
    /** Anchor id of a comment covering this run, if any. */
    comment?: string
  }[]
}

function runsOf(nodes: Node[] | undefined): Block['runs'] {
  const runs: Block['runs'] = []
  const walk = (n: Node): void => {
    if (n.type === 'text') {
      const marks = new Set((n.marks ?? []).map((m) => m.type))
      // Carry the comment id so the docx writer can wrap this run in a
      // comment range; Word then shows it as a review comment.
      const commentMark = (n.marks ?? []).find((m) => m.type === 'comment')
      runs.push({
        text: n.text ?? '',
        bold: marks.has('bold'),
        italic: marks.has('italic'),
        strike: marks.has('strike'),
        code: marks.has('code'),
        comment: commentMark?.attrs?.commentId
          ? String(commentMark.attrs.commentId)
          : undefined
      })
      return
    }
    if (n.type === 'hardBreak') {
      runs.push({ text: '\n' })
      return
    }
    if (n.type === 'mention') {
      runs.push({ text: String(n.attrs?.label ?? '') })
      return
    }
    if (n.type === 'crossref') {
      runs.push({ text: String(n.attrs?._resolved ?? n.attrs?.display ?? '?') })
      return
    }
    if (n.type === 'footnote') {
      // sentinel: the docx writer swaps this for a real footnote reference
      runs.push({ text: '\u0000footnote' })
      return
    }
    n.content?.forEach(walk)
  }
  ;(nodes ?? []).forEach(walk)
  return runs
}

/** Flattens a Tiptap document into blocks the docx builder can consume. */
export function contentToBlocks(stored: string): Block[] {
  if (!stored) return []
  let doc: Node
  try {
    doc = JSON.parse(stored) as Node
  } catch {
    return [{ kind: 'paragraph', runs: [{ text: stored }] }]
  }

  const blocks: Block[] = []
  const visit = (node: Node, listKind?: 'bullet' | 'ordered'): void => {
    switch (node.type) {
      case 'paragraph':
        blocks.push({ kind: listKind ?? 'paragraph', runs: runsOf(node.content) })
        break
      case 'heading':
        blocks.push({
          kind: 'heading',
          level: Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2))),
          runs: runsOf(node.content)
        })
        break
      case 'blockquote':
        for (const child of node.content ?? []) {
          blocks.push({ kind: 'quote', runs: runsOf(child.content) })
        }
        break
      case 'bulletList':
        for (const li of node.content ?? []) {
          for (const child of li.content ?? []) visit(child, 'bullet')
        }
        break
      case 'orderedList':
        for (const li of node.content ?? []) {
          for (const child of li.content ?? []) visit(child, 'ordered')
        }
        break
      case 'codeBlock':
        blocks.push({ kind: 'code', runs: [{ text: plainText(node), code: true }] })
        break
      case 'pageBreak':
        blocks.push({ kind: 'pagebreak', runs: [] })
        break
      case 'caption': {
        const label = `${node.attrs?.kind === 'table' ? 'Table' : 'Figure'} ${node.attrs?._n ?? ''}`.trim()
        blocks.push({
          kind: 'paragraph',
          runs: [{ text: `${label}. `, bold: true }, ...runsOf(node.content)]
        })
        break
      }
      case 'toc': {
        const entries = (node.attrs?.entries ?? []) as {
          text: string
          level: number
          page: number
        }[]
        blocks.push({
          kind: 'heading',
          level: 1,
          runs: [{ text: String(node.attrs?.title ?? 'Contents'), bold: true }]
        })
        for (const e of entries) {
          blocks.push({
            kind: 'paragraph',
            runs: [{ text: `${'    '.repeat(Math.max(0, e.level - 1))}${e.text}\t${e.page}` }]
          })
        }
        break
      }
      default:
        node.content?.forEach((c) => visit(c, listKind))
        break
    }
  }
  ;(doc.content ?? []).forEach((n) => visit(n))
  return blocks
}

/** Footnote texts in document order — the number is the position in this list. */
export function collectFootnotes(stored: string): string[] {
  if (!stored) return []
  let doc: Node
  try {
    doc = JSON.parse(stored) as Node
  } catch {
    return []
  }
  const notes: string[] = []
  const walk = (n: Node): void => {
    if (n.type === 'footnote') notes.push(String((n.attrs as any)?.text ?? ''))
    n.content?.forEach(walk)
  }
  walk(doc)
  return notes
}

/**
 * Fills the empty markers with their numbers and appends the notes.
 *
 * Chromium has no CSS footnote support, so printed notes gather at the end
 * rather than per page. The editor and Word export both place them at page
 * feet; this is the one surface that can't, and it says so with a heading.
 */
export function withFootnotes(html: string, notes: string[]): string {
  if (!notes.length) return html
  let i = 0
  const numbered = html.replace(
    /<sup class="footnote-ref" data-footnote="1"><\/sup>/g,
    () => `<sup class="footnote-ref">${++i}</sup>`
  )
  const list = notes
    .map((t, idx) => `<div class="footnote-item"><sup>${idx + 1}</sup> ${escapeHtml(t)}</div>`)
    .join('')
  return `${numbered}<div class="footnotes"><div class="footnotes-title">Notes</div>${list}</div>`
}

/**
 * Numbers every heading, figure caption, table caption, and footnote in
 * document order, then resolves every cross-reference against those numbers —
 * exactly what the editor's "Update refs" does, run once for export so the
 * output always reflects the document's current state regardless of whether
 * the author remembered to click Update.
 */
export function resolveReferences(stored: string): string {
  if (!stored) return stored
  let doc: any
  try {
    doc = JSON.parse(stored)
  } catch {
    return stored
  }

  const counters = [0, 0, 0, 0, 0, 0]
  const kindCounts: Record<string, number> = { figure: 0, table: 0, footnote: 0 }
  const numbers = new Map<string, string>()
  const displays = new Map<string, string>()

  const scan = (n: any): void => {
    if (n.type === 'heading') {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)))
      counters[level - 1] += 1
      for (let i = level; i < counters.length; i++) counters[i] = 0
      const number = counters.slice(0, level).join('.')
      if (n.attrs?.refId) {
        numbers.set(n.attrs.refId, number)
        displays.set(n.attrs.refId, `Section ${number}`)
      }
    } else if (n.type === 'caption') {
      const kind = n.attrs?.kind === 'table' ? 'table' : 'figure'
      kindCounts[kind] += 1
      n.attrs._n = kindCounts[kind]
      if (n.attrs?.captionId) {
        displays.set(n.attrs.captionId, `${kind === 'table' ? 'Table' : 'Figure'} ${kindCounts[kind]}`)
      }
    } else if (n.type === 'footnote') {
      kindCounts.footnote += 1
      if (n.attrs?.refId) displays.set(n.attrs.refId, `Note ${kindCounts.footnote}`)
    }
    n.content?.forEach(scan)
  }
  scan(doc)

  const apply = (n: any): void => {
    if (n.type === 'crossref' && n.attrs) {
      n.attrs._resolved = displays.get(n.attrs.targetId) ?? n.attrs.display ?? '(missing)'
    }
    n.content?.forEach(apply)
  }
  apply(doc)

  return JSON.stringify(doc)
}
