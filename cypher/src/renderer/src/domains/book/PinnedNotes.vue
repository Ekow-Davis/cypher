<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { StickyNote, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-vue-next'
import { useNotesStore, MAX_NOTES } from '@/stores/notes'

const store = useNotesStore()
const open = ref(true)

const COLORS: { key: string; swatch: string }[] = [
  { key: 'default', swatch: 'var(--color-surface-2)' },
  { key: 'amber', swatch: '#f59e0b' },
  { key: 'rose', swatch: '#f43f5e' },
  { key: 'emerald', swatch: '#10b981' },
  { key: 'sky', swatch: '#0ea5e9' },
  { key: 'violet', swatch: '#8b5cf6' }
]

function tint(color: string | null): string {
  const c = COLORS.find((x) => x.key === color)
  if (!c || c.key === 'default') return 'var(--color-surface-2)'
  return `color-mix(in oklab, ${c.swatch} 16%, var(--color-surface-2))`
}
function edge(color: string | null): string {
  const c = COLORS.find((x) => x.key === color)
  if (!c || c.key === 'default') return 'var(--color-border)'
  return `color-mix(in oklab, ${c.swatch} 45%, transparent)`
}

// one debounce timer per note so typing in two notes can't clobber either
const timers = new Map<number, ReturnType<typeof setTimeout>>()
function scheduleSave(id: number, patch: { title?: string; content?: string }): void {
  const existing = timers.get(id)
  if (existing) clearTimeout(existing)
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      void store.save(id, patch)
    }, 600)
  )
}

const paletteFor = ref<number | null>(null)
function pickColor(id: number, key: string): void {
  paletteFor.value = null
  void store.save(id, { color: key === 'default' ? null : key })
}

onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
})
</script>

<template>
  <section class="rounded-xl border border-border bg-surface">
    <button class="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold" @click="open = !open">
      <StickyNote :size="15" class="text-accent" />
      Pinned notes
      <span v-if="store.notes.length" class="text-xs font-normal text-ink-dim">
        {{ store.notes.length }}/{{ MAX_NOTES }}
      </span>
      <component :is="open ? ChevronDown : ChevronRight" :size="14" class="ml-auto text-ink-dim" />
    </button>

    <div v-if="open" class="space-y-2 px-3 pb-3">
      <p v-if="store.lastError" class="rounded-lg bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
        {{ store.lastError }}
      </p>

      <div
        v-for="note in store.notes"
        :key="note.id"
        class="group/note rounded-lg border p-2"
        :style="{ background: tint(note.color), borderColor: edge(note.color) }"
      >
        <div class="mb-1 flex items-center gap-1">
          <input
            :value="note.title"
            placeholder="Title"
            class="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-ink-dim"
            @input="scheduleSave(note.id, { title: ($event.target as HTMLInputElement).value })"
          />
          <button
            class="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover/note:opacity-100"
            title="Colour"
            @click="paletteFor = paletteFor === note.id ? null : note.id"
          >
            <span
              class="block h-3 w-3 rounded-full border border-border"
              :style="{ background: edge(note.color) }"
            />
          </button>
          <button
            class="shrink-0 rounded p-0.5 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover/note:opacity-100"
            title="Delete note"
            @click="store.remove(note.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>

        <div v-if="paletteFor === note.id" class="mb-1.5 flex gap-1">
          <button
            v-for="c in COLORS"
            :key="c.key"
            class="h-4 w-4 rounded-full border border-border"
            :style="{ background: c.swatch }"
            :title="c.key"
            @click="pickColor(note.id, c.key)"
          />
        </div>

        <textarea
          :value="note.content"
          rows="3"
          placeholder="Jot something…"
          class="w-full resize-y bg-transparent text-xs outline-none placeholder:text-ink-dim"
          @input="scheduleSave(note.id, { content: ($event.target as HTMLTextAreaElement).value })"
        />
      </div>

      <button
        v-if="store.notes.length < MAX_NOTES"
        class="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-xs text-ink-dim transition-colors hover:text-ink"
        @click="store.add()"
      >
        <Plus :size="13" /> Add note
      </button>
      <p v-else class="text-center text-[10px] text-ink-dim">Note limit reached.</p>
    </div>
  </section>
</template>
