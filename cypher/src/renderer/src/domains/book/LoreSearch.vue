<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Search, Replace, ReplaceAll, Loader2 } from 'lucide-vue-next'
import { useLoreStore } from '@/stores/lore'
import { extractPlainText } from '@/lib/textStats'
import { countMatches, snippetHtml, findOccurrences, replaceInDoc, replaceInText } from '@/lib/search'

const emit = defineEmits<{ close: [] }>()
const store = useLoreStore()

type Scope = 'entry' | 'category' | 'all'
const scope = ref<Scope>('all')
const query = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(() => input.value?.focus())

const scoped = computed(() => {
  if (scope.value === 'entry') return store.active ? [store.active] : []
  if (scope.value === 'category') {
    const cat = store.active?.category
    return cat ? store.entries.filter((e) => e.category === cat) : []
  }
  return store.entries
})

const results = computed(() => {
  const q = query.value.trim()
  if (q.length < 2) return []
  return scoped.value
    .map((e) => {
      const text = extractPlainText(e.content)
      const inBody = countMatches(text, q)
      const inTitle = countMatches(e.title, q)
      if (!inBody && !inTitle) return null
      return {
        id: e.id,
        title: e.title,
        context: e.category,
        count: inBody + inTitle,
        titleSnippet: inTitle ? snippetHtml(e.title, q) : null,
        occurrences: findOccurrences(e.content, q)
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.count - a.count)
})

const showReplace = ref(false)
const replacement = ref('')
const confirmAll = ref(false)
const busy = ref(false)
const lastResult = ref<string | null>(null)
const collapsed = ref<Set<number>>(new Set())

function toggle(id: number): void {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

/**
 * Replaces across every entry in scope.
 *
 * Lore entries aren't open in an editor, so this rewrites the stored document
 * directly — walking text nodes rather than the serialised JSON, which would
 * otherwise mangle attributes that happen to contain the same word.
 */
async function replaceAll(): Promise<void> {
  const q = query.value.trim()
  if (q.length < 2) return
  if (!confirmAll.value) {
    confirmAll.value = true
    setTimeout(() => (confirmAll.value = false), 4000)
    return
  }
  confirmAll.value = false
  busy.value = true
  lastResult.value = null

  let entries = 0
  let total = 0
  try {
    for (const result of results.value) {
      const entry = store.entries.find((e) => e.id === result.id)
      if (!entry) continue

      const body = replaceInDoc(entry.content, q, replacement.value)
      const title = replaceInText(entry.title, q, replacement.value)
      if (!body.replaced && !title.replaced) continue

      if (body.replaced) await store.saveContent(entry.id, body.content)
      if (title.replaced) await store.rename(entry.id, title.text)
      entries += 1
      total += body.replaced + title.replaced
    }
    lastResult.value = `Replaced ${total} match(es) across ${entries} entr${entries === 1 ? 'y' : 'ies'}.`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-border px-3 py-2">
      <div class="mb-2 flex items-center gap-1.5">
        <Search :size="14" class="shrink-0 text-ink-dim" />
        <input
          ref="input"
          v-model="query"
          placeholder="Search codex…"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
          @keydown.esc="emit('close')"
        />
        <button
          class="shrink-0 rounded p-0.5 transition-colors"
          :class="showReplace ? 'text-accent' : 'text-ink-dim hover:text-ink'"
          title="Replace"
          @click="showReplace = !showReplace"
        >
          <Replace :size="14" />
        </button>
        <button class="shrink-0 rounded p-0.5 text-ink-dim hover:text-ink" title="Close search" @click="emit('close')">
          <X :size="14" />
        </button>
      </div>

      <div v-if="showReplace" class="mb-2 flex items-center gap-1">
        <input
          v-model="replacement"
          placeholder="Replace with…"
          class="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent-line"
        />
        <button
          class="rounded border p-1 transition-colors disabled:opacity-40"
          :class="confirmAll ? 'border-amber-400 text-amber-400' : 'border-border text-ink-dim hover:text-ink'"
          :disabled="busy || !results.length"
          :title="confirmAll ? 'Click again to confirm' : 'Replace everywhere in scope'"
          @click="replaceAll"
        >
          <Loader2 v-if="busy" :size="13" class="animate-spin" />
          <ReplaceAll v-else :size="13" />
        </button>
      </div>
      <p v-if="confirmAll" class="mb-2 text-[10px] text-amber-400">
        Rewrites {{ results.length }} entr{{ results.length === 1 ? 'y' : 'ies' }}. Click again to
        confirm.
      </p>
      <p v-if="lastResult" class="mb-2 text-[10px] text-accent">{{ lastResult }}</p>
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="s in (['entry', 'category', 'all'] as const)"
          :key="s"
          class="rounded-md border px-1 py-1 text-[11px] capitalize"
          :class="scope === s ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          @click="scope = s"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto py-2">
      <p v-if="query.trim().length < 2" class="px-4 py-3 text-xs text-ink-dim">
        Type at least 2 characters.
      </p>
      <template v-else>
        <div v-for="r in results" :key="r.id" class="mb-1">
          <button
            class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-2"
            :class="store.activeId === r.id ? 'text-ink' : 'text-ink-dim'"
            @click="store.setActive(r.id); toggle(r.id)"
          >
            <span class="min-w-0 flex-1 truncate text-sm">{{ r.title }}</span>
            <span class="shrink-0 text-[10px]">{{ r.count }}</span>
          </button>
          <div class="px-3 pb-0.5 pl-5 text-[10px] text-ink-dim">{{ r.context }}</div>

          <div v-show="!collapsed.has(r.id)" class="pl-3">
            <div
              v-if="r.titleSnippet"
              class="mx-2 mb-1 rounded-lg px-2 py-1.5"
            >
              <span class="text-[10px] uppercase tracking-wide text-accent">In title</span>
              <p class="text-xs text-ink-dim" v-html="r.titleSnippet"></p>
            </div>
            <button
              v-for="occ in r.occurrences"
              :key="occ.index"
              class="mx-2 mb-1 block w-[calc(100%-1rem)] rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              @click="store.setActive(r.id)"
            >
              <span class="flex items-baseline gap-2 text-[10px] text-ink-dim">
                <span class="tabular-nums">#{{ occ.index + 1 }}</span>
                <span>{{ Math.round(occ.progress * 100) }}% in</span>
              </span>
              <p class="mt-0.5 line-clamp-2 text-xs text-ink-dim" v-html="occ.snippet"></p>
            </button>
          </div>
        </div>
        <p v-if="!results.length" class="px-4 py-3 text-xs text-ink-dim">No matches.</p>
      </template>
    </div>
  </div>
</template>
