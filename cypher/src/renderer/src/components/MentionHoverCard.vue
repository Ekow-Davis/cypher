<script setup lang="ts">
/**
 * A preview card for @ references: hover a mention in a chapter or lore entry
 * to see who or what it is without leaving the page.
 *
 * One card for the whole workspace, driven by delegated mouse events, so no
 * editor needs to know it exists.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ScrollText, UserRound, ArrowUpRight } from 'lucide-vue-next'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import { useBookUiStore } from '@/stores/bookUi'
import { extractPlainText } from '@/lib/textStats'
import { assetUrl } from '@/lib/assets'
import type { CharacterSheet } from '@shared/types'

const lore = useLoreStore()
const characters = useCharactersStore()
const ui = useBookUiStore()

const target = ref<{ kind: 'character' | 'lore'; id: number } | null>(null)
const pos = ref({ left: 0, top: 0, above: false, anchorTop: 0 })
const card = ref<HTMLElement | null>(null)

let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

const entry = computed(() =>
  target.value?.kind === 'lore' ? lore.entries.find((e) => e.id === target.value!.id) ?? null : null
)
const person = computed(() =>
  target.value?.kind === 'character'
    ? characters.characters.find((c) => c.id === target.value!.id) ?? null
    : null
)

const excerpt = computed(() => {
  if (!entry.value) return ''
  const text = extractPlainText(entry.value.content).replace(/\s+/g, ' ').trim()
  return text.length > 320 ? `${text.slice(0, 320).trimEnd()}…` : text
})

/** The first few filled-in sheet fields — enough to jog the memory. */
const facts = computed(() => {
  if (!person.value) return []
  try {
    const sheet = JSON.parse(person.value.fields_json) as CharacterSheet
    const out: { label: string; value: string }[] = []
    for (const section of sheet.sections ?? []) {
      for (const f of section.fields ?? []) {
        const value = String((f as { value?: string }).value ?? '').trim()
        if (value && out.length < 5) {
          out.push({
            label: f.label || section.title,
            value: value.length > 120 ? `${value.slice(0, 120)}…` : value
          })
        }
      }
    }
    return out
  } catch {
    return []
  }
})

function place(el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  const width = 300
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
  const above = r.bottom + 240 > window.innerHeight
  pos.value = { left, top: r.bottom + 6, above, anchorTop: r.top - 6 }
}

function onOver(e: MouseEvent): void {
  const el = (e.target as HTMLElement | null)?.closest?.('.ProseMirror [data-type="mention"]') as HTMLElement | null
  if (card.value?.contains(e.target as Node)) {
    clearTimeout(hideTimer)
    return
  }
  if (!el) {
    if (target.value) {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => (target.value = null), 180)
    }
    clearTimeout(showTimer)
    return
  }
  const id = Number(el.getAttribute('data-id'))
  if (!Number.isFinite(id)) return
  const kind = el.getAttribute('data-kind') === 'lore' ? 'lore' : 'character'
  clearTimeout(hideTimer)
  clearTimeout(showTimer)
  showTimer = setTimeout(
    () => {
      place(el)
      target.value = { kind, id }
    },
    target.value ? 60 : 350
  )
}

function open(): void {
  const t = target.value
  if (!t) return
  target.value = null
  if (t.kind === 'lore') ui.openLore(t.id)
  else ui.openCharacter(t.id)
}

function hide(): void {
  clearTimeout(showTimer)
  target.value = null
}

onMounted(() => {
  document.addEventListener('mouseover', onOver)
  document.addEventListener('scroll', hide, true)
  document.addEventListener('keydown', hide, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mouseover', onOver)
  document.removeEventListener('scroll', hide, true)
  document.removeEventListener('keydown', hide, true)
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
})
</script>

<template>
  <div
    v-if="target && (entry || person)"
    ref="card"
    class="fixed z-[75] w-[300px] rounded-xl border border-border bg-surface p-3 shadow-2xl"
    :style="
      pos.above
        ? { left: pos.left + 'px', bottom: `calc(100vh - ${pos.anchorTop}px)` }
        : { left: pos.left + 'px', top: pos.top + 'px' }
    "
  >
    <template v-if="entry">
      <div class="mb-1 flex items-center gap-2">
        <ScrollText :size="14" class="shrink-0 text-accent" />
        <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ entry.title }}</span>
        <span class="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-dim">{{ entry.category }}</span>
      </div>
      <p class="text-xs leading-relaxed text-ink-dim">{{ excerpt || 'This entry is empty.' }}</p>
    </template>

    <template v-else-if="person">
      <div class="mb-2 flex items-center gap-2.5">
        <span class="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
          <img v-if="person.image_path" :src="assetUrl(person.image_path)" class="h-full w-full object-cover" alt="" />
          <span v-else class="flex h-full w-full items-center justify-center text-ink-dim"><UserRound :size="16" /></span>
        </span>
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold">{{ person.name }}</div>
          <div v-if="person.folder" class="truncate text-[11px] text-ink-dim">{{ person.folder }}</div>
        </div>
      </div>
      <dl v-if="facts.length" class="space-y-1">
        <div v-for="f in facts" :key="f.label + f.value" class="text-xs">
          <dt class="inline text-ink-dim">{{ f.label }}: </dt>
          <dd class="inline">{{ f.value }}</dd>
        </div>
      </dl>
      <p v-else class="text-xs text-ink-dim">No sheet details yet.</p>
    </template>

    <button
      class="mt-2 flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
      @click="open"
    >
      Open <ArrowUpRight :size="11" />
    </button>
  </div>
</template>
