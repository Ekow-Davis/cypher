<script setup lang="ts">
import { computed } from 'vue'
import { Library, Layers, FileText } from 'lucide-vue-next'
import { useLoreStore } from '@/stores/lore'
import { extractPlainText } from '@/lib/textStats'

const store = useLoreStore()

const totalEntries = computed(() => store.entries.length)
const totalCategories = computed(() => store.groups.length)

const activeWordCount = computed(() => {
  if (!store.active) return 0
  const text = extractPlainText(store.active.content).trim()
  return text ? text.split(/\s+/).length : 0
})

function jumpToCategory(category: string): void {
  const first = store.groups.find((g) => g.category === category)?.items[0]
  if (first) store.setActive(first.id)
}
</script>

<template>
  <aside class="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface/60">
    <div class="border-b border-border px-4 py-3">
      <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Codex details</span>
    </div>

    <div class="space-y-3 p-3">
      <!-- overview -->
      <section class="rounded-xl border border-border bg-surface p-3">
        <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Library :size="15" class="text-accent" /> Overview
        </div>
        <div class="grid grid-cols-2 gap-2 text-center">
          <div class="rounded-lg bg-surface-2 py-2">
            <div class="text-lg font-bold tabular-nums">{{ totalEntries }}</div>
            <div class="text-[10px] text-ink-dim">entries</div>
          </div>
          <div class="rounded-lg bg-surface-2 py-2">
            <div class="text-lg font-bold tabular-nums">{{ totalCategories }}</div>
            <div class="text-[10px] text-ink-dim">categories</div>
          </div>
        </div>
      </section>

      <!-- categories breakdown -->
      <section class="rounded-xl border border-border bg-surface p-3">
        <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Layers :size="15" class="text-accent" /> Categories
        </div>
        <div v-if="!store.groups.length" class="text-xs text-ink-dim">No categories yet.</div>
        <ul v-else class="space-y-1">
          <li v-for="g in store.groups" :key="g.category">
            <button
              class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              @click="jumpToCategory(g.category)"
            >
              <span class="truncate">{{ g.category }}</span>
              <span class="ml-2 shrink-0 text-xs tabular-nums">{{ g.items.length }}</span>
            </button>
          </li>
        </ul>
      </section>

      <!-- current entry -->
      <section v-if="store.active" class="rounded-xl border border-border bg-surface p-3">
        <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
          <FileText :size="15" class="text-accent" /> This entry
        </div>
        <div class="mb-1 truncate text-sm">{{ store.active.title }}</div>
        <div class="flex items-center justify-between text-xs text-ink-dim">
          <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ store.active.category }}</span>
          <span class="tabular-nums">{{ activeWordCount.toLocaleString() }} words</span>
        </div>
      </section>
    </div>
  </aside>
</template>
