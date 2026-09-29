<script setup lang="ts">
/**
 * "Referenced in" — every chapter and lore entry that @-mentions a character
 * or lore entry, with the sentence around each mention.
 */
import { computed, ref } from 'vue'
import { Link2, BookText, ScrollText, ChevronDown, ChevronRight } from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import { useLoreStore } from '@/stores/lore'
import { useBookUiStore } from '@/stores/bookUi'
import { backlinksTo } from '@/lib/backlinks'

const props = defineProps<{ kind: 'character' | 'lore'; id: number; compact?: boolean }>()

const chapters = useChaptersStore()
const lore = useLoreStore()
const ui = useBookUiStore()
const open = ref<Set<string>>(new Set())

const links = computed(() => {
  const ordered = [...chapters.chapters].sort((a, b) => a.sort_order - b.sort_order)
  return backlinksTo(
    props.kind,
    props.id,
    ordered.map((c) => ({ id: c.id, title: chapters.displayTitle(c.id), content: c.content })),
    lore.entries
  )
})
const chapterLinks = computed(() => links.value.filter((l) => l.source === 'chapter'))
const loreLinks = computed(() => links.value.filter((l) => l.source === 'lore'))
const total = computed(() => links.value.reduce((n, l) => n + l.count, 0))

function toggle(key: string): void {
  const next = new Set(open.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  open.value = next
}

function go(source: 'chapter' | 'lore', id: number): void {
  if (source === 'chapter') ui.openChapterAtMention(id, props.kind, props.id)
  else ui.openLore(id)
}

/** ⟦name⟧ marks the mention itself; everything else is escaped text. */
function markup(snippet: string): string {
  const esc = (t: string): string =>
    t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  return esc(snippet).replace(/⟦([^⟧]*)⟧/g, '<mark class="cypher-mark">$1</mark>')
}
</script>

<template>
  <section class="rounded-xl border border-border bg-surface p-3">
    <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
      <Link2 :size="15" class="text-accent" /> Referenced in
      <span class="ml-auto text-xs font-normal tabular-nums text-ink-dim">
        {{ total }} mention{{ total === 1 ? '' : 's' }}
      </span>
    </div>
    <p v-if="!links.length" class="text-xs text-ink-dim">
      Nothing mentions this yet. Type @ in a chapter or lore entry to link to it.
    </p>

    <template v-for="group in [{ label: 'Chapters', items: chapterLinks, icon: BookText }, { label: 'Lore', items: loreLinks, icon: ScrollText }]" :key="group.label">
      <div v-if="group.items.length" class="mt-2">
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{{ group.label }}</div>
        <div v-for="l in group.items" :key="`${l.source}-${l.id}`" class="mb-1">
          <div class="flex items-center gap-1">
            <button
              class="shrink-0 rounded p-0.5 text-ink-dim hover:text-ink"
              :title="open.has(`${l.source}-${l.id}`) ? 'Hide context' : 'Show context'"
              @click="toggle(`${l.source}-${l.id}`)"
            >
              <component :is="open.has(`${l.source}-${l.id}`) ? ChevronDown : ChevronRight" :size="12" />
            </button>
            <button
              class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              @click="go(l.source, l.id)"
            >
              <component :is="group.icon" :size="12" class="shrink-0 opacity-60" />
              <span class="min-w-0 flex-1 truncate">{{ l.title }}</span>
              <span class="shrink-0 text-[10px] tabular-nums">×{{ l.count }}</span>
            </button>
          </div>
          <div v-if="open.has(`${l.source}-${l.id}`)" class="ml-5 space-y-1 border-l border-border pl-2">
            <p
              v-for="(s, i) in l.snippets.slice(0, compact ? 3 : 8)"
              :key="i"
              class="text-xs leading-relaxed text-ink-dim"
              v-html="markup(s)"
            ></p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
