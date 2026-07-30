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
  runs: { text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean }[]
}

function runsOf(nodes: Node[] | undefined): Block['runs'] {
  const runs: Block['runs'] = []
  const walk = (n: Node): void => {
    if (n.type === 'text') {
      const marks = new Set((n.marks ?? []).map((m) => m.type))
      runs.push({
        text: n.text ?? '',
        bold: marks.has('bold'),
        italic: marks.has('italic'),
        strike: marks.has('strike'),
        code: marks.has('code')
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
