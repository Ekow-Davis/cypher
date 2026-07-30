import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const paginationKey = new PluginKey('cypherPagination')

export interface BlockPage {
  offset: number
  page: number
}

export interface PageLayout {
  pages: number
  /** Which page each top-level block starts on (1-based). */
  blocks: BlockPage[]
  /** Distance between the top of one sheet and the next, in px. */
  cycle: number
  /** Sheet height in px. */
  sheet: number
}

interface Options {
  enabled: () => boolean
  onLayout: (layout: PageLayout) => void
}

interface Geometry {
  page: number
  margin: number
  gap: number
  content: number
}

/**
 * Paginates the editor into fixed-height sheets.
 *
 * Pages are a constant size — a short page still occupies a full sheet, exactly
 * as in a word processor — so what you see matches what prints. The spacer
 * inserted at a page boundary therefore covers the unused remainder plus the
 * bottom margin, the desk gap, and the next page's top margin.
 *
 * Spacers are ProseMirror decorations, so they never enter the document, never
 * reach an export, and can't be typed into.
 */
export const Pagination = Extension.create<Options>({
  name: 'cypherPagination',

  addOptions() {
    return { enabled: () => true, onLayout: () => undefined }
  },

  addProseMirrorPlugins() {
    const { enabled, onLayout } = this.options
    let scheduled = 0
    let signature = ''

    /** All geometry comes from probe elements, so it follows the zoom level. */
    function geometry(view: EditorView): Geometry | null {
      const host = view.dom.closest('.doc-canvas') as HTMLElement | null
      if (!host) return null
      // getBoundingClientRect throughout: offsetHeight and rects disagree under
      // CSS zoom, and mixing the two silently corrupts the maths.
      const read = (sel: string): number =>
        (host.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect().height ?? 0
      const page = read('.m-page')
      const margin = read('.m-margin')
      const gap = read('.m-gap')
      if (page <= 0 || margin <= 0) return null
      return { page, margin, gap, content: page - margin * 2 }
    }

    function spacer(pos: number, height: number): Decoration {
      return Decoration.widget(
        pos,
        () => {
          const el = document.createElement('div')
          el.className = 'doc-page-gap'
          el.style.height = `${Math.max(0, height)}px`
          el.setAttribute('contenteditable', 'false')
          return el
        },
        { side: -1, ignoreSelection: true, key: `gap-${pos}-${Math.round(height)}` }
      )
    }

    /** Spacer heights currently in the document, so natural sizes can be recovered. */
    let applied = new Map<number, number>()

    function build(view: EditorView): {
      set: DecorationSet
      pages: number
      blocks: BlockPage[]
      sig: string
      cycle: number
      sheet: number
    } {
      const geo = geometry(view)
      if (!geo) return { set: DecorationSet.empty, pages: 1, blocks: [], sig: '', cycle: 0, sheet: 0 }

      const layerTop = view.dom.getBoundingClientRect().top
      const blocks: {
        offset: number
        after: number
        isBreak: boolean
        top: number
        height: number
      }[] = []

      view.state.doc.forEach((node, offset) => {
        const dom = view.nodeDOM(offset)
        if (!(dom instanceof HTMLElement)) return
        const rect = dom.getBoundingClientRect()
        blocks.push({
          offset,
          after: offset + node.nodeSize,
          isBreak: node.type.name === 'pageBreak',
          top: rect.top - layerTop,
          height: rect.height
        })
      })

      /**
       * Natural height is the distance to the next block minus any spacer we
       * put between them. Taking it from rendered positions rather than summing
       * offsetHeight plus margins is what makes this correct: adjacent margins
       * collapse, so adding them up over-counts and lets text spill past the
       * bottom of the page.
       */
      const flow: number[] = blocks.map((b, i) => {
        if (i === blocks.length - 1) return b.height
        const spacerBelow = applied.get(blocks[i + 1].offset) ?? 0
        return Math.max(0, blocks[i + 1].top - b.top - spacerBelow)
      })

      const decorations: Decoration[] = []
      const next = new Map<number, number>()
      const parts: string[] = []
      const blockPages: BlockPage[] = []
      const carry = geo.margin * 2 + geo.gap
      let used = 0
      let pages = 1

      blocks.forEach((b, i) => {
        blockPages.push({ offset: b.offset, page: pages })
        if (b.isBreak) {
          // The marker itself takes room on the page it ends, so it counts
          // toward that page and the spacer goes after it — otherwise its
          // height silently pushed the next page's text down.
          const consumed = used + flow[i]
          const height = Math.max(0, geo.content - consumed) + carry
          decorations.push(spacer(b.after, height))
          next.set(b.after, height)
          parts.push(`b${b.after}:${Math.round(height)}`)
          pages += 1
          used = 0
          return
        }

        const height = flow[i]
        if (used > 0 && used + height > geo.content && height <= geo.content) {
          const gapHeight = geo.content - used + carry
          decorations.push(spacer(b.offset, gapHeight))
          next.set(b.offset, gapHeight)
          parts.push(`${b.offset}:${Math.round(gapHeight)}`)
          pages += 1
          // the block itself sits on the new page
          blockPages[blockPages.length - 1].page = pages
          used = height
        } else {
          used += height
          // a block taller than a page spills across the ones after it
          while (used > geo.content) {
            used -= geo.content
            pages += 1
          }
        }
      })

      applied = next
      return {
        set: DecorationSet.create(view.state.doc, decorations),
        pages,
        blocks: blockPages,
        sig: parts.join('|'),
        cycle: geo.page + geo.gap,
        sheet: geo.page
      }
    }

    return [
      new Plugin({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(paginationKey)
            if (meta) return meta as DecorationSet
            return old.map(tr.mapping, tr.doc)
          }
        },
        props: {
          decorations(state) {
            return enabled() ? paginationKey.getState(state) : DecorationSet.empty
          }
        },
        view(view) {
          const measure = (): void => {
            if (!enabled()) {
              signature = ''
              applied = new Map()
              onLayout({ pages: 1, blocks: [], cycle: 0, sheet: 0 })
              if (paginationKey.getState(view.state) !== DecorationSet.empty) {
                view.dispatch(view.state.tr.setMeta(paginationKey, DecorationSet.empty))
              }
              return
            }
            const { set, pages, blocks, sig, cycle, sheet } = build(view)
            onLayout({ pages, blocks, cycle, sheet })
            // Dispatching unconditionally would re-trigger measurement forever.
            if (sig !== signature) {
              signature = sig
              view.dispatch(view.state.tr.setMeta(paginationKey, set))
            }
          }

          const schedule = (): void => {
            if (scheduled) cancelAnimationFrame(scheduled)
            scheduled = requestAnimationFrame(() => {
              scheduled = 0
              measure()
            })
          }

          schedule()
          const observer = new ResizeObserver(schedule)
          const host = view.dom.closest('.doc-canvas')
          if (host) observer.observe(host)

          return {
            update: schedule,
            destroy() {
              if (scheduled) cancelAnimationFrame(scheduled)
              observer.disconnect()
            }
          }
        }
      })
    ]
  }
})
