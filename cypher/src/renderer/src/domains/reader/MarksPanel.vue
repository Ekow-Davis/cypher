<script setup lang="ts">
import { ref } from 'vue'
import { Bookmark, Highlighter, Trash2, StickyNote } from 'lucide-vue-next'
import { useMarksStore, HIGHLIGHT_COLORS, COLOR_HEX } from '@/stores/marks'
import type { ReaderMark } from '@shared/types'

defineProps<{ locationLabel?: (m: ReaderMark) => string }>()
const emit = defineEmits<{ jump: [mark: ReaderMark]; removed: [mark: ReaderMark] }>()

/** Announce first so the reader can clear the paint, then delete. */
async function removeMark(mark: ReaderMark): Promise<void> {
  emit('removed', mark)
  await store.remove(mark.id)
}

const store = useMarksStore()
const editingNote = ref<number | null>(null)
const noteDraft = ref('')

function startNote(mark: ReaderMark): void {
  editingNote.value = mark.id
  noteDraft.value = mark.note ?? ''
}
async function commitNote(): Promise<void> {
  if (editingNote.value != null) {
    await store.update(editingNote.value, { note: noteDraft.value.trim() || null })
  }
  editingNote.value = null
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">
      Bookmarks &amp; highlights
    </div>

    <div class="flex-1 overflow-auto px-2 py-1">
      <p v-if="!store.marks.length" class="px-2 py-4 text-xs text-ink-dim">
        Nothing saved yet. Bookmark a spot, or select text to highlight it.
      </p>

      <div
        v-for="mark in store.marks"
        :key="mark.id"
        class="group mb-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
      >
        <div class="flex items-start gap-2">
          <component
            :is="mark.kind === 'bookmark' ? Bookmark : Highlighter"
            :size="13"
            class="mt-0.5 shrink-0"
            :style="{ color: mark.color ? COLOR_HEX[mark.color] : 'var(--color-accent)' }"
          />
          <button class="min-w-0 flex-1 text-left" @click="emit('jump', mark)">
            <span class="block truncate text-xs font-medium">
              {{ locationLabel ? locationLabel(mark) : (mark.label ?? 'Saved spot') }}
            </span>
            <span v-if="mark.excerpt" class="mt-0.5 line-clamp-2 block text-[11px] text-ink-dim">
              {{ mark.excerpt }}
            </span>
          </button>
          <button
            class="shrink-0 rounded p-0.5 text-ink-dim opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
            title="Add a note"
            @click="startNote(mark)"
          >
            <StickyNote :size="12" />
          </button>
          <button
            class="shrink-0 rounded p-0.5 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            title="Delete"
            @click="removeMark(mark)"
          >
            <Trash2 :size="12" />
          </button>
        </div>

        <div v-if="editingNote === mark.id" class="mt-1 pl-5">
          <textarea
            v-model="noteDraft"
            rows="2"
            placeholder="Your note…"
            class="w-full resize-y rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] outline-none focus:border-accent-line"
            @blur="commitNote"
            @keydown.esc="editingNote = null"
          />
          <div v-if="mark.kind === 'highlight'" class="mt-1 flex gap-1">
            <button
              v-for="c in HIGHLIGHT_COLORS"
              :key="c"
              class="h-3.5 w-3.5 rounded-full border border-border"
              :style="{ background: COLOR_HEX[c] }"
              :title="c"
              @mousedown.prevent="store.update(mark.id, { color: c })"
            />
          </div>
        </div>
        <p v-else-if="mark.note" class="mt-0.5 pl-5 text-[11px] italic text-ink-dim">
          {{ mark.note }}
        </p>
      </div>
    </div>
  </div>
</template>
