<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChartLine, Trash2 } from 'lucide-vue-next'
import { usePreferencesStore } from '@/stores/preferences'

const prefs = usePreferencesStore()
const router = useRouter()
const confirmClear = ref(false)
const cleared = ref(false)

async function clearAll(): Promise<void> {
  await window.cypher.stats.clear()
  confirmClear.value = false
  cleared.value = true
  setTimeout(() => (cleared.value = false), 3000)
}
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <ChartLine :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Writing stats</h2>
    </div>
    <p class="mb-5 text-sm leading-relaxed text-ink-dim">
      Charts of how much you write, how fast, when, and in which book. Only numbers are kept, on this
      computer — never the words themselves. Once on, open them from the button in the corner of your
      bookshelf, or with <kbd class="rounded border border-border px-1 text-xs">Ctrl K</kbd> → "stats".
    </p>

    <label class="mb-3 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        class="h-4 w-4"
        style="accent-color: var(--color-accent)"
        :checked="prefs.statsEnabled"
        @change="prefs.setStatsEnabled(($event.target as HTMLInputElement).checked)"
      />
      Collect writing statistics
    </label>
    <label class="mb-5 flex items-center gap-2 text-sm" :class="prefs.statsEnabled ? '' : 'opacity-50'">
      <input
        type="checkbox"
        class="h-4 w-4"
        style="accent-color: var(--color-accent)"
        :disabled="!prefs.statsEnabled"
        :checked="prefs.statsIncludeDiary"
        @change="prefs.setStatsIncludeDiary(($event.target as HTMLInputElement).checked)"
      />
      Include diary writing (word counts only)
    </label>

    <div class="flex flex-wrap items-center gap-2">
      <button
        class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent"
        @click="router.push('/stats')"
      >
        <ChartLine :size="15" /> Open stats
      </button>
      <button
        v-if="!confirmClear"
        class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm text-ink-dim hover:text-red-400"
        @click="confirmClear = true"
      >
        <Trash2 :size="14" /> Clear all stats
      </button>
      <template v-else>
        <span class="text-sm">Delete every recorded statistic?</span>
        <button class="rounded-lg px-2 py-1 text-sm text-ink-dim hover:text-ink" @click="confirmClear = false">Keep</button>
        <button class="rounded-lg bg-red-500 px-3 py-1 text-sm font-semibold text-white" @click="clearAll">Delete</button>
      </template>
      <span v-if="cleared" class="text-xs text-accent">Cleared.</span>
    </div>
  </div>
</template>
