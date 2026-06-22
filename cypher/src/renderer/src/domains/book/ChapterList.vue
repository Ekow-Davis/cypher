<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'

const store = useChaptersStore()
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Manuscript</span>
      <button
        class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        title="Add chapter"
        @click="store.add()"
      >
        <Plus :size="16" />
      </button>
    </div>

    <div class="flex-1 overflow-auto py-2">
      <div
        v-for="(ch, i) in store.chapters"
        :key="ch.id"
        class="group mx-2 mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors"
        :class="
          store.activeId === ch.id
            ? 'bg-accent-soft text-ink'
            : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
        "
        @click="store.setActive(ch.id)"
      >
        <span class="w-5 shrink-0 text-xs text-ink-dim">{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <span class="block truncate text-sm">{{ ch.title }}</span>
          <span class="block text-[10px] text-ink-dim">{{ ch.word_count.toLocaleString() }} words</span>
        </div>
        <button
          class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          title="Delete chapter"
          @click.stop="store.remove(ch.id)"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>
  </aside>
</template>
