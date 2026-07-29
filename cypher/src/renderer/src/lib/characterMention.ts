import Mention from '@tiptap/extension-mention'
import { VueRenderer } from '@tiptap/vue-3'
import MentionList, { type MentionItem } from '@/domains/book/MentionList.vue'
import { useCharactersStore } from '@/stores/characters'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * "@" character mentions. Typing @ opens an autocomplete of the book's cast;
 * picking one inserts an inline node carrying the character's id, which the
 * editors turn into a click-through to that character's sheet.
 * If no character matches, the last option creates one on the spot.
 */
export function createCharacterMention(): any {
  return Mention.configure({
    HTMLAttributes: { class: 'cypher-mention' },
    suggestion: {
      char: '@',
      allowSpaces: false,
      items: ({ query }: { query: string }): MentionItem[] => {
        const store = useCharactersStore()
        const q = query.toLowerCase().trim()
        const matches: MentionItem[] = store.characters
          .filter((c) => c.name.toLowerCase().includes(q))
          .slice(0, 8)
          .map((c) => ({ id: c.id, label: c.name, image: c.image_path }))

        const exact = store.characters.some((c) => c.name.toLowerCase() === q)
        if (q.length >= 2 && !exact) {
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
            el.appendChild(component.element)
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

/** Shared click handler: turns a click on a mention into "open that character". */
export function mentionClickHandler(
  openCharacter: (id: number) => void
): (view: unknown, pos: number, event: MouseEvent) => boolean {
  return (_view, _pos, event) => {
    const target = (event.target as HTMLElement | null)?.closest?.('[data-type="mention"]')
    if (!target) return false
    const id = Number(target.getAttribute('data-id'))
    if (Number.isNaN(id)) return false
    openCharacter(id)
    return true
  }
}
