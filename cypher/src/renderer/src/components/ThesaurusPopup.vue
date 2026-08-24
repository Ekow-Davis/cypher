<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { BookA, X, Loader2, AlertCircle, Copy, Check } from 'lucide-vue-next'

interface Result {
  word: string
  synonyms: string[]
  antonyms: string[]
  error?: string
}

/**
 * Opened from the right-click menu in any editor, so it lives at app level
 * rather than inside one domain — Book, Document and Diary all reach it
 * through the same event without knowing it exists.
 */
const open = ref(false)
const loading = ref(false)
const result = ref<Result | null>(null)
const copied = ref<string | null>(null)
let stop: (() => void) | null = null

async function lookup(word: string): Promise<void> {
  open.value = true
  loading.value = true
  result.value = null
  try {
    result.value = (await window.cypher.thesaurus.lookup(word)) as Result
  } catch (e) {
    result.value = {
      word,
      synonyms: [],
      antonyms: [],
      error: e instanceof Error ? e.message : String(e)
    }
  } finally {
    loading.value = false
  }
}

/** Copying rather than replacing: the selection has usually been lost by now. */
async function copy(word: string): Promise<void> {
  await navigator.clipboard.writeText(word)
  copied.value = word
  setTimeout(() => (copied.value = null), 1500)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) open.value = false
}

onMounted(() => {
  stop = window.cypher.thesaurus.onLookup((word) => void lookup(word))
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  stop?.()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    v-if="open"
    class="fixed bottom-6 right-6 z-[70] w-80 rounded-2xl border border-border bg-surface shadow-2xl"
  >
    <div class="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <BookA :size="16" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1 truncate text-sm font-semibold">
        {{ result?.word ?? 'Looking up…' }}
      </span>
      <button class="shrink-0 rounded p-1 text-ink-dim hover:text-ink" @click="open = false">
        <X :size="15" />
      </button>
    </div>

    <div class="max-h-80 overflow-auto p-4">
      <div v-if="loading" class="flex items-center gap-2 text-sm text-ink-dim">
        <Loader2 :size="15" class="animate-spin" /> Looking up…
      </div>

      <p
        v-else-if="result?.error"
        class="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim"
      >
        <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ result.error }}
      </p>

      <template v-else-if="result">
        <div v-if="result.synonyms.length" class="mb-4">
          <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
            Synonyms
          </div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="w in result.synonyms"
              :key="`s-${w}`"
              class="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-dim transition-colors hover:border-accent-line hover:text-ink"
              title="Copy"
              @click="copy(w)"
            >
              {{ w }}
              <component :is="copied === w ? Check : Copy" :size="10" class="opacity-50" />
            </button>
          </div>
        </div>

        <div v-if="result.antonyms.length">
          <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
            Antonyms
          </div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="w in result.antonyms"
              :key="`a-${w}`"
              class="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-dim transition-colors hover:border-accent-line hover:text-ink"
              title="Copy"
              @click="copy(w)"
            >
              {{ w }}
              <component :is="copied === w ? Check : Copy" :size="10" class="opacity-50" />
            </button>
          </div>
        </div>

        <p
          v-if="!result.synonyms.length && !result.antonyms.length"
          class="text-xs text-ink-dim"
        >
          Nothing found for this word.
        </p>
      </template>
    </div>
  </div>
</template>
