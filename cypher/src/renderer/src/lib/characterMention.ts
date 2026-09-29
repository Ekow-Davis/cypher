import Mention from '@tiptap/extension-mention'
import { VueRenderer } from '@tiptap/vue-3'
import MentionList, { type MentionItem } from '@/domains/book/MentionList.vue'
import { useCharactersStore } from '@/stores/characters'
import { useLoreStore } from '@/stores/lore'
import { looseKey } from './mentionRefs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type { MentionKind } from './mentionRefs'

export interface MentionOptions {
  /** Offer lore entries alongside the cast. */
  lore?: boolean
  /** A lore entry that must not be offered — the one being edited. */
  excludeLoreId?: () => number | null
}

export { looseKey }

/**
 * "@" mentions. Typing @ opens an autocomplete of the book's cast — and, where
 * enabled, its lore entries — and picking one inserts an inline node carrying
 * the target's id and kind, which the editors turn into a click-through.
 * If no character matches, the last option creates one on the spot.
 *
 * Nodes written before lore references existed carry no kind and are read as
 * characters, which is what they all were.
 */
export function createCharacterMention(options: MentionOptions = {}): any {
  return Mention.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        kind: {
          default: 'character',
          parseHTML: (el: HTMLElement) => el.getAttribute('data-kind') || 'character',
          renderHTML: (attrs: Record<string, unknown>) => ({ 'data-kind': attrs.kind ?? 'character' })
        }
      }
    }
  }).configure({
    HTMLAttributes: { class: 'cypher-mention' },
    suggestion: {
      char: '@',
      allowSpaces: false,
      items: ({ query }: { query: string }): MentionItem[] => {
        const store = useCharactersStore()
        const q = query.toLowerCase().trim()
        const loose = looseKey(q)
        const hit = (name: string): boolean =>
          name.toLowerCase().includes(q) || (!!loose && looseKey(name).includes(loose))

        const matches: MentionItem[] = store.characters
          .filter((c) => hit(c.name))
          .slice(0, options.lore ? 6 : 8)
          .map((c) => ({ id: c.id, label: c.name, image: c.image_path, kind: 'character' }))

        let loreExact = false
        if (options.lore) {
          const lore = useLoreStore()
          const skip = options.excludeLoreId?.() ?? null
          const entries = lore.entries.filter((e) => e.id !== skip)
          loreExact = entries.some((e) => looseKey(e.title) === loose)
          matches.push(
            ...entries
              .filter((e) => hit(e.title))
              .slice(0, 6)
              .map((e) => ({
                id: e.id,
                label: e.title,
                kind: 'lore' as const,
                detail: e.category
              }))
          )
        }

        const exact = store.characters.some((c) => c.name.toLowerCase() === q)
        if (q.length >= 2 && !exact && !loreExact) {
          matches.push({ id: '__create__', label: query.trim(), isCreate: true })
        }
        return matches
      },
      render: () => {
        let component: VueRenderer | null = null
        let el: HTMLDivElement | null = null

        const destroy = (): void => {
          el?.remove()
          el = null
          component?.destroy()
          component = null
        }

        const place = (getRect: (() => DOMRect | null) | null | undefined): void => {
          if (!el || !getRect) return
          const r = getRect()
          if (!r) return
          const width = 256
          const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
          // flip above the caret when there isn't room below
          const below = r.bottom + 6
          const fitsBelow = below + 240 < window.innerHeight
          el.style.left = `${left}px`
          el.style.top = fitsBelow ? `${below}px` : ''
          el.style.bottom = fitsBelow ? '' : `${window.innerHeight - r.top + 6}px`
        }

        return {
          onStart: (props: any) => {
            component = new VueRenderer(MentionList, { props, editor: props.editor })
            el = document.createElement('div')
            el.style.position = 'fixed'
            el.style.zIndex = '70'
            document.body.appendChild(el)
            if (component.element) el.appendChild(component.element as globalThis.Node)
            place(props.clientRect)
          },
          onUpdate: (props: any) => {
            component?.updateProps(props)
            place(props.clientRect)
          },
          onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
              destroy()
              return true
            }
            return (component?.ref as any)?.onKeyDown?.(props) ?? false
          },
          onExit: () => destroy()
        }
      }
    }
  })
}

/**
 * Shared click handler: turns a click on a mention into "open that character"
 * or "open that lore entry", depending on what the mention points at.
 */
export function mentionClickHandler(
  openCharacter: (id: number) => void,
  openLore?: (id: number) => void
): (view: unknown, pos: number, event: MouseEvent) => boolean {
  return (_view, _pos, event) => {
    const target = (event.target as HTMLElement | null)?.closest?.('[data-type="mention"]')
    if (!target) return false
    const id = Number(target.getAttribute('data-id'))
    // -1 is an unlinked reference (copied from the library, no match here yet).
    if (Number.isNaN(id) || id < 0) return false
    if (target.getAttribute('data-kind') === 'lore') {
      if (!openLore) return false
      openLore(id)
      return true
    }
    openCharacter(id)
    return true
  }
}

/** Current display name for a mention target, or null if it no longer exists. */
export function currentMentionName(kind: unknown, id: unknown): string | null {
  const n = Number(id)
  if (!Number.isFinite(n)) return null
  if (kind === 'lore') return useLoreStore().entries.find((e) => e.id === n)?.title ?? null
  return useCharactersStore().characters.find((c) => c.id === n)?.name ?? null
}

/** A same-kind target whose name matches, ignoring case and separators. */
export function findByLabel(kind: unknown, label: string): { id: number; name: string } | null {
  const key = looseKey(label)
  if (!key) return null
  if (kind === 'lore') {
    const e = useLoreStore().entries.find((x) => looseKey(x.title) === key)
    return e ? { id: e.id, name: e.title } : null
  }
  const c = useCharactersStore().characters.find((x) => looseKey(x.name) === key)
  return c ? { id: c.id, name: c.name } : null
}

/** Changes whenever any character or lore entry is renamed, added or removed. */
export function mentionNamesKey(): string {
  const chars = useCharactersStore().characters.map((c) => `${c.id}:${c.name}`).join('|')
  const lore = useLoreStore().entries.map((e) => `${e.id}:${e.title}`).join('|')
  return `${chars}#${lore}`
}

/**
 * Brings every mention's stored label up to date with the current name.
 *
 * Mentions store the name they were created with so exports and search can
 * read it without a lookup; this keeps that copy honest after a rename. It
 * runs when a document opens and whenever names change, as a single
 * transaction kept out of the undo history — a rename elsewhere isn't
 * something the writer should be able to "undo" here. Mentions whose target
 * was deleted keep their last name unless a same-named one exists.
 */
export function syncMentionLabels(editor: any): number {
  if (!editor || editor.isDestroyed) return 0
  const { state } = editor
  const tr = state.tr
  let changed = 0
  state.doc.descendants((node: any, pos: number) => {
    if (node.type.name !== 'mention') return
    const name = currentMentionName(node.attrs.kind, node.attrs.id)
    if (name) {
      if (name !== node.attrs.label) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: name })
        changed++
      }
      return
    }
    // The target is gone (or never existed here — lore copied in from the
    // library arrives unlinked). Reconnect it to a same-named one if present.
    const found = findByLabel(node.attrs.kind, String(node.attrs.label ?? ''))
    if (found) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: found.id, label: found.name })
      changed++
    }
  })
  if (changed) {
    tr.setMeta('addToHistory', false)
    editor.view.dispatch(tr)
  }
  return changed
}
