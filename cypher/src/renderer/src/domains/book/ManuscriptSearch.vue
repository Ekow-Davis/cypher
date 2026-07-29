<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Search } from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import { extractPlainText } from '@/lib/textStats'
import { countMatches, snippetHtml } from '@/lib/search'

const emit = defineEmits<{ close: [] }>()
const store = useChaptersStore()

type Scope = 'chapter' | 'volume' | 'book'
const scope = ref<Scope>('book')
const query = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(() => input.value?.focus())

const scoped = computed(() => {
  const all = store.chapters
  if (scope.value === 'chapter') return store.active ? [store.active] : []
  if (scope.value === 'volume') {
    const vid = store.active?.volume_id ?? null
    return all.filter((c) => c.volume_id === vid)
  }
  return all
})

const results = computed(() => {
  const q = query.value.trim()
  if (q.length < 2) return []
  return scoped.value
    .map((c) => {
      const text = extractPlainText(c.content)
      const inBody = countMatches(text, q)
      const inTitle = countMatches(c.title, q)
      if (!inBody && !inTitle) return null
      const volume = store.volumes.find((v) => v.id === c.volume_id)
      return {
        id: c.id,
        title: c.title,
        context: volume?.title ?? 'Unsorted',
        count: inBody + inTitle,
        snippet: inBody ? snippetHtml(text, q) : snippetHtml(c.title, q)
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.count - a.count)
})

const totalHits = computed(() => results.value.reduce((n, r) => n + r.count, 0))
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-border px-3 py-2">
      <div class="mb-2 flex items-center gap-1.5">
        <Search :size="14" class="shrink-0 text-ink-dim" />
        <input
          ref="input"
          v-model="query"
          placeholder="Search manuscript…"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
          @keydown.esc="emit('close')"
        />
        <button class="shrink-0 rounded p-0.5 text-ink-dim hover:text-ink" title="Close search" @click="emit('close')">
          <X :size="14" />
        </button>
      </div>
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="s in (['chapter', 'volume', 'book'] as const)"
          :key="s"
          class="rounded-md border px-1 py-1 text-[11px] capitalize"
          :class="scope === s ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          @click="scope = s"
        >
          {{ s === 'book' ? 'All' : s }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto py-2">
      <p v-if="query.trim().length < 2" class="px-4 py-3 text-xs text-ink-dim">
        Type at least 2 characters.
      </p>
      <template v-else>
        <p class="px-4 pb-1 text-[10px] uppercase tracking-wide text-ink-dim">
          {{ totalHits }} match(es) in {{ results.length }} chapter(s)
        </p>
        <button
          v-for="r in results"
          :key="r.id"
          class="mx-2 mb-1 block w-[calc(100%-1rem)] rounded-lg px-3 py-2 text-left transition-colors"
          :class="store.activeId === r.id ? 'bg-accent-soft' : 'hover:bg-surface-2'"
          @click="store.setActive(r.id)"
        >
          <div class="flex items-baseline justify-between gap-2">
            <span class="min-w-0 truncate text-sm">{{ r.title }}</span>
            <span class="shrink-0 text-[10px] text-ink-dim">{{ r.count }}</span>
          </div>
          <div class="truncate text-[10px] text-ink-dim">{{ r.context }}</div>
          <p class="mt-1 line-clamp-2 text-xs text-ink-dim" v-html="r.snippet"></p>
        </button>
        <p v-if="!results.length" class="px-4 py-3 text-xs text-ink-dim">No matches.</p>
      </template>
    </div>
  </div>
</template>
