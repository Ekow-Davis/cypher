<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  X,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowDown,
  Replace,
  ReplaceAll
} from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import { useBookUiStore } from '@/stores/bookUi'
import { countMatches, findOccurrences, snippetHtml } from '@/lib/search'

const emit = defineEmits<{ close: [] }>()
const store = useChaptersStore()
const bookUi = useBookUiStore()

type Scope = 'chapter' | 'volume' | 'book'
const scope = ref<Scope>('book')
const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const collapsed = ref<Set<number>>(new Set())
const showReplace = ref(false)
const replacement = ref('')
const confirmAll = ref(false)

onMounted(() => input.value?.focus())

const scoped = computed(() => {
  const all = [...store.chapters].sort((a, b) => a.sort_order - b.sort_order)
  if (scope.value === 'chapter') return store.active ? [store.active] : []
  if (scope.value === 'volume') {
    const vid = store.active?.volume_id ?? null
    return all.filter((c) => c.volume_id === vid)
  }
  return all
})

/** Chapters with a hit, each carrying every individual occurrence. */
const results = computed(() => {
  const q = query.value.trim()
  if (q.length < 2) return []
  return scoped.value
    .map((chapter) => {
      const occurrences = findOccurrences(chapter.content, q)
      const inTitle = countMatches(chapter.title, q)
      if (!occurrences.length && !inTitle) return null
      const volume = store.volumes.find((v) => v.id === chapter.volume_id)
      return {
        id: chapter.id,
        title: chapter.title,
        context: volume?.title ?? 'Unsorted',
        titleSnippet: inTitle ? snippetHtml(chapter.title, q) : null,
        occurrences
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
})

/**
 * A flat list of every hit across every chapter, in reading order.
 *
 * The arrows walk this rather than per-chapter lists, so pressing next at the
 * end of one chapter carries you into the top of the following one — which is
 * what someone scanning a whole manuscript expects.
 */
const flatHits = computed(() =>
  results.value.flatMap((chapter) =>
    chapter.occurrences.map((occ) => ({ chapterId: chapter.id, hitIndex: occ.index }))
  )
)

const totalHits = computed(() => flatHits.value.length)
const cursor = ref(-1)

// A new query invalidates any position in the old result set.
watch(query, () => {
  cursor.value = -1
  collapsed.value = new Set()
})

function goTo(position: number): void {
  if (!flatHits.value.length) return
  const wrapped = (position + flatHits.value.length) % flatHits.value.length
  cursor.value = wrapped
  const hit = flatHits.value[wrapped]
  if (store.activeId !== hit.chapterId) store.setActive(hit.chapterId)
  bookUi.jumpToHit(hit.chapterId, query.value.trim(), hit.hitIndex)
}

function step(delta: number): void {
  goTo(cursor.value + delta)
}

function openHit(chapterId: number, hitIndex: number): void {
  const position = flatHits.value.findIndex(
    (h) => h.chapterId === chapterId && h.hitIndex === hitIndex
  )
  if (position !== -1) goTo(position)
}

function isCurrent(chapterId: number, hitIndex: number): boolean {
  const hit = flatHits.value[cursor.value]
  return !!hit && hit.chapterId === chapterId && hit.hitIndex === hitIndex
}

/** Replaces the hit the cursor is on, then moves to the next one. */
function replaceCurrent(): void {
  const hit = flatHits.value[cursor.value]
  if (!hit) {
    step(1)
    return
  }
  bookUi.requestReplace(hit.chapterId, query.value.trim(), replacement.value, hit.hitIndex)
  // Positions shift after a replace, so re-resolve rather than assuming.
  setTimeout(() => goTo(cursor.value), 120)
}

/**
 * Replaces every match in scope, one chapter at a time.
 *
 * Deliberately behind a confirm: this edits chapters that aren't on screen,
 * which is exactly the kind of change someone can't eyeball before it happens.
 */
function replaceAll(): void {
  if (!confirmAll.value) {
    confirmAll.value = true
    setTimeout(() => (confirmAll.value = false), 4000)
    return
  }
  confirmAll.value = false
  const q = query.value.trim()
  const chapterIds = [...new Set(flatHits.value.map((h) => h.chapterId))]
  chapterIds.forEach((chapterId, i) => {
    // Staggered: each chapter must be the loaded one for its edit to apply.
    setTimeout(() => {
      store.setActive(chapterId)
      setTimeout(() => bookUi.requestReplace(chapterId, q, replacement.value, null), 80)
    }, i * 220)
  })
}

function toggle(chapterId: number): void {
  const next = new Set(collapsed.value)
  if (next.has(chapterId)) next.delete(chapterId)
  else next.add(chapterId)
  collapsed.value = next
}

/** "38% in" — a rough sense of where the hit sits without a page number. */
function positionLabel(progress: number): string {
  return `${Math.round(progress * 100)}% in`
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
          placeholder="Search manuscript…"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
          @keydown.esc="emit('close')"
          @keydown.enter.prevent="step(1)"
          @keydown.shift.enter.prevent="step(-1)"
        />
        <button
          class="shrink-0 rounded p-0.5 text-ink-dim hover:text-ink"
          title="Close search"
          @click="emit('close')"
        >
          <X :size="14" />
        </button>
      </div>

      <!-- navigation -->
      <div v-if="totalHits" class="mb-2 flex items-center gap-1">
        <span class="flex-1 text-[11px] tabular-nums text-ink-dim">
          {{ cursor >= 0 ? `${cursor + 1} of ${totalHits}` : `${totalHits} matches` }}
        </span>
        <button
          class="rounded border border-border p-1 text-ink-dim transition-colors hover:text-ink"
          title="Previous match (Shift+Enter)"
          @click="step(-1)"
        >
          <ChevronUp :size="13" />
        </button>
        <button
          class="rounded border border-border p-1 text-ink-dim transition-colors hover:text-ink"
          title="Next match (Enter)"
          @click="step(1)"
        >
          <ArrowDown :size="13" />
        </button>
        <button
          class="rounded border p-1 transition-colors"
          :class="showReplace ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          title="Replace"
          @click="showReplace = !showReplace"
        >
          <Replace :size="13" />
        </button>
      </div>

      <!-- replace -->
      <div v-if="showReplace" class="mb-2 flex items-center gap-1">
        <input
          v-model="replacement"
          placeholder="Replace with…"
          class="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent-line"
        />
        <button
          class="rounded border border-border p-1 text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
          :disabled="!totalHits"
          title="Replace this match"
          @click="replaceCurrent"
        >
          <Replace :size="13" />
        </button>
        <button
          class="rounded border p-1 transition-colors disabled:opacity-40"
          :class="confirmAll ? 'border-amber-400 text-amber-400' : 'border-border text-ink-dim hover:text-ink'"
          :disabled="!totalHits"
          :title="confirmAll ? 'Click again to confirm' : 'Replace all matches in scope'"
          @click="replaceAll"
        >
          <ReplaceAll :size="13" />
        </button>
      </div>
      <p v-if="confirmAll" class="mb-2 text-[10px] text-amber-400">
        Replaces {{ totalHits }} match(es) across {{ results.length }} chapter(s). Click again to
        confirm.
      </p>

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
        <p v-if="!results.length" class="px-4 py-3 text-xs text-ink-dim">No matches.</p>

        <div v-for="chapter in results" :key="chapter.id" class="mb-1">
          <button
            class="flex w-full items-center gap-1 px-3 py-1.5 text-left transition-colors hover:bg-surface-2"
            :class="store.activeId === chapter.id ? 'text-ink' : 'text-ink-dim'"
            @click="toggle(chapter.id)"
          >
            <component
              :is="collapsed.has(chapter.id) ? ChevronRight : ChevronDown"
              :size="12"
              class="shrink-0"
            />
            <span class="min-w-0 flex-1 truncate text-sm">{{ chapter.title }}</span>
            <span class="shrink-0 text-[10px] tabular-nums">
              {{ chapter.occurrences.length || 1 }}
            </span>
          </button>
          <div class="px-3 pb-0.5 pl-7 text-[10px] text-ink-dim">{{ chapter.context }}</div>

          <div v-show="!collapsed.has(chapter.id)" class="pl-5">
            <button
              v-if="chapter.titleSnippet"
              class="mx-2 mb-1 block w-[calc(100%-1rem)] rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              @click="store.setActive(chapter.id)"
            >
              <span class="text-[10px] uppercase tracking-wide text-accent">In title</span>
              <p class="text-xs text-ink-dim" v-html="chapter.titleSnippet"></p>
            </button>

            <button
              v-for="occ in chapter.occurrences"
              :key="occ.index"
              class="mx-2 mb-1 block w-[calc(100%-1rem)] rounded-lg px-2 py-1.5 text-left transition-colors"
              :class="
                isCurrent(chapter.id, occ.index)
                  ? 'bg-accent-soft ring-1 ring-accent-line'
                  : 'hover:bg-surface-2'
              "
              @click="openHit(chapter.id, occ.index)"
            >
              <span class="flex items-baseline gap-2">
                <span class="shrink-0 text-[10px] tabular-nums text-ink-dim">
                  #{{ occ.index + 1 }}
                </span>
                <span class="shrink-0 text-[10px] text-ink-dim">
                  {{ positionLabel(occ.progress) }}
                </span>
              </span>
              <p class="mt-0.5 line-clamp-2 text-xs text-ink-dim" v-html="occ.snippet"></p>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
