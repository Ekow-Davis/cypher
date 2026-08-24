<script setup lang="ts">
import { ref, computed } from 'vue'
import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { createCharacterMention } from '@/lib/characterMention'
import {
  FileInput,
  AlertCircle,
  Check,
  Loader2,
  Info,
  Trash2,
  BookOpen
} from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import type { ManuscriptImport, DetectedChapter } from '@shared/types'

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ close: [] }>()

const chapters = useChaptersStore()

const picking = ref(false)
const applying = ref(false)
const result = ref<ManuscriptImport | null>(null)
const error = ref<string | null>(null)
const dropped = ref<Set<number>>(new Set())

const kept = computed<DetectedChapter[]>(
  () => result.value?.chapters.filter((_, i) => !dropped.value.has(i)) ?? []
)
const keptWords = computed(() => kept.value.reduce((sum, c) => sum + c.words, 0))

const modeMessage = computed(() => {
  if (!result.value) return ''
  switch (result.value.mode) {
    case 'headings':
      return 'Split using the document’s own heading styles.'
    case 'patterns':
      return 'Split on lines that look like chapter titles.'
    default:
      return 'No chapter structure found — everything came in as one chapter.'
  }
})

async function pick(): Promise<void> {
  picking.value = true
  error.value = null
  try {
    const imported = await window.cypher.chapters.importPick()
    if (imported) {
      result.value = imported
      dropped.value = new Set()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    picking.value = false
  }
}

function toggle(index: number): void {
  const next = new Set(dropped.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  dropped.value = next
}

async function apply(): Promise<void> {
  if (!result.value || !kept.value.length) return
  applying.value = true
  error.value = null
  try {
    // Parsed through a real editor rather than a standalone HTML converter:
    // it guarantees the imported chapters use exactly the schema the chapter
    // editor will later open them with, so nothing is silently dropped on
    // first edit. One instance is reused for every chapter, then destroyed.
    const parser = new Editor({ extensions: [StarterKit, createCharacterMention()] })
    let items: { title: string; content: string; wordCount: number }[]
    try {
      items = kept.value.map((chapter) => {
        parser.commands.setContent(chapter.html || '<p></p>')
        return {
          title: chapter.title,
          content: JSON.stringify(parser.getJSON()),
          wordCount: chapter.words
        }
      })
    } finally {
      parser.destroy()
    }
    const updated = await window.cypher.chapters.importApply(props.bookId, items, null)
    chapters.chapters = updated
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="flex max-h-[86vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface">
      <div class="flex items-center gap-2 border-b border-border px-6 py-4">
        <FileInput :size="18" class="text-accent" />
        <div>
          <h2 class="text-lg font-bold">Import chapters</h2>
          <p class="text-sm text-ink-dim">From a Word document or PDF.</p>
        </div>
      </div>

      <div class="flex-1 space-y-4 overflow-auto px-6 py-4">
        <template v-if="!result">
          <div class="rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-ink-dim">
            <p class="mb-2 flex items-center gap-1.5 font-semibold text-ink">
              <Info :size="13" /> For the best split
            </p>
            <p class="mb-1.5">Cypher looks for chapter breaks in this order:</p>
            <ul class="ml-4 list-disc space-y-1">
              <li>Word <strong>heading styles</strong> (Heading 1 or 2) — most reliable</li>
              <li>
                Lines like <strong>Chapter 4</strong>, <strong>Chapter IV — The Fall</strong>,
                or <strong>4 — The Fall</strong>, on their own line
              </li>
              <li><strong>Prologue</strong>, <strong>Epilogue</strong> and similar are recognised too</li>
            </ul>
            <p class="mt-2">
              If neither is found, the whole file arrives as a single chapter you can split by hand.
            </p>
          </div>

          <button
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-on-accent disabled:opacity-60"
            :disabled="picking"
            @click="pick"
          >
            <Loader2 v-if="picking" :size="15" class="animate-spin" />
            <FileInput v-else :size="15" />
            {{ picking ? 'Reading…' : 'Choose a file…' }}
          </button>
        </template>

        <template v-else>
          <div class="rounded-xl border border-border bg-surface-2/60 p-3">
            <p class="text-sm font-medium">{{ result.fileName }}</p>
            <p class="mt-0.5 text-xs text-ink-dim">{{ modeMessage }}</p>
            <p class="mt-1 text-xs text-ink-dim">
              {{ kept.length }} chapter{{ kept.length === 1 ? '' : 's' }} ·
              {{ keptWords.toLocaleString() }} words
            </p>
          </div>

          <p class="text-xs text-ink-dim">
            Review below — uncheck anything you don’t want, such as a title page.
          </p>

          <div class="max-h-64 overflow-auto rounded-xl border border-border">
            <label
              v-for="(chapter, index) in result.chapters"
              :key="index"
              class="flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-2"
              :class="dropped.has(index) ? 'opacity-45' : ''"
            >
              <input
                type="checkbox"
                class="mt-1 h-3.5 w-3.5 shrink-0"
                style="accent-color: var(--color-accent)"
                :checked="!dropped.has(index)"
                @change="toggle(index)"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{{ chapter.title }}</span>
                <span class="block text-[10px] text-ink-dim">{{ chapter.words.toLocaleString() }} words</span>
              </span>
            </label>
          </div>

          <p class="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-ink-dim">
            <BookOpen :size="13" class="mt-0.5 shrink-0" />
            Chapters are added to the end of this book. Nothing already written is changed.
          </p>
        </template>

        <p v-if="error" class="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
        </p>
      </div>

      <div class="flex items-center gap-2 border-t border-border px-6 py-4">
        <button
          v-if="result"
          class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink"
          @click="result = null"
        >
          <Trash2 :size="14" /> Choose another
        </button>
        <button class="ml-auto rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="emit('close')">
          Cancel
        </button>
        <button
          v-if="result"
          class="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
          :disabled="applying || !kept.length"
          @click="apply"
        >
          <Loader2 v-if="applying" :size="14" class="animate-spin" />
          <Check v-else :size="14" />
          Add {{ kept.length }} chapter{{ kept.length === 1 ? '' : 's' }}
        </button>
      </div>
    </div>
  </div>
</template>
