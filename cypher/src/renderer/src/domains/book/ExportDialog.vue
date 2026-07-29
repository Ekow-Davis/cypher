<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  FileText,
  FileType,
  BookOpen,
  Loader2,
  Check,
  AlertCircle,
  ListChecks
} from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import { usePreferencesStore } from '@/stores/preferences'
import type { ExportFormat, ChapterStatus } from '@shared/types'

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ close: [] }>()

const chaptersStore = useChaptersStore()
const prefs = usePreferencesStore()

const format = ref<ExportFormat>('docx')
const author = ref('')
const titlePage = ref(true)
const includeCover = ref(true)
const volumeHeadings = ref(true)
const includeSynopsis = ref(false)
const tableOfContents = ref(true)
const busy = ref(false)
const done = ref<string | null>(null)
const error = ref<string | null>(null)

const FORMATS: { key: ExportFormat; label: string; icon: typeof FileText; blurb: string }[] = [
  { key: 'docx', label: 'Word', icon: FileText, blurb: 'Editable .docx for editors or submissions' },
  { key: 'pdf', label: 'PDF', icon: FileType, blurb: 'Fixed layout for reading or printing' },
  { key: 'epub', label: 'EPUB', icon: BookOpen, blurb: 'Reflowable e-book for readers and phones' }
]

const STATUSES: { key: ChapterStatus; label: string; dot: string }[] = [
  { key: 'outline', label: 'Outline', dot: 'bg-slate-400' },
  { key: 'draft', label: 'Draft', dot: 'bg-amber-400' },
  { key: 'revised', label: 'Revised', dot: 'bg-sky-400' },
  { key: 'final', label: 'Final', dot: 'bg-emerald-400' }
]

// Chapters in manuscript order, matching the sidebar.
const ordered = computed(() => {
  const byOrder = (a: { sort_order: number; id: number }, b: { sort_order: number; id: number }) =>
    a.sort_order - b.sort_order || a.id - b.id
  const out: { id: number; title: string; status: ChapterStatus; volume: string }[] = []
  for (const v of chaptersStore.volumes) {
    for (const c of chaptersStore.chapters.filter((x) => x.volume_id === v.id).sort(byOrder)) {
      out.push({ id: c.id, title: c.title, status: (c.status ?? 'draft') as ChapterStatus, volume: v.title })
    }
  }
  for (const c of chaptersStore.chapters.filter((x) => x.volume_id == null).sort(byOrder)) {
    out.push({ id: c.id, title: c.title, status: (c.status ?? 'draft') as ChapterStatus, volume: 'Unsorted' })
  }
  return out
})

const activeStatuses = ref<Set<ChapterStatus>>(new Set(['outline', 'draft', 'revised', 'final']))
const selected = ref<Set<number>>(new Set())

/** Status chips act as a bulk filter; individual ticks refine it afterwards. */
function applyStatusFilter(): void {
  selected.value = new Set(
    ordered.value.filter((c) => activeStatuses.value.has(c.status)).map((c) => c.id)
  )
}
function toggleStatus(key: ChapterStatus): void {
  const next = new Set(activeStatuses.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  activeStatuses.value = next
  applyStatusFilter()
}
function toggleChapter(id: number): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function selectAll(): void {
  selected.value = new Set(ordered.value.map((c) => c.id))
}
function selectNone(): void {
  selected.value = new Set()
}

watch(ordered, applyStatusFilter, { immediate: true })
onMounted(() => {
  author.value = prefs.defaultAuthor
})

const dotFor = (s: ChapterStatus): string => STATUSES.find((x) => x.key === s)?.dot ?? 'bg-amber-400'

async function run(): Promise<void> {
  busy.value = true
  done.value = null
  error.value = null
  try {
    const res = await window.cypher.exporter.book(props.bookId, format.value, {
      author: author.value,
      titlePage: titlePage.value,
      includeCover: includeCover.value,
      volumeHeadings: volumeHeadings.value,
      includeSynopsis: includeSynopsis.value,
      tableOfContents: tableOfContents.value,
      chapterIds: [...selected.value]
    })
    if (res.cancelled) {
      busy.value = false
      return
    }
    if (res.error) error.value = res.error
    else done.value = `Exported ${res.chapters} chapter(s) to ${res.path}`
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface">
      <div class="border-b border-border px-6 py-4">
        <h2 class="text-lg font-bold">Export book</h2>
        <p class="text-sm text-ink-dim">Choose a format, then exactly what goes in it.</p>
      </div>

      <div class="flex-1 space-y-5 overflow-auto px-6 py-4">
        <!-- format -->
        <div class="space-y-1">
          <button
            v-for="f in FORMATS"
            :key="f.key"
            class="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors"
            :class="format === f.key ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'"
            @click="format = f.key"
          >
            <component :is="f.icon" :size="18" :class="format === f.key ? 'text-accent' : 'text-ink-dim'" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{{ f.label }}</span>
              <span class="block text-xs text-ink-dim">{{ f.blurb }}</span>
            </span>
          </button>
        </div>

        <!-- author -->
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Author / pen name
          </label>
          <input
            v-model="author"
            placeholder="Leave blank to omit"
            class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
          />
        </div>

        <!-- front matter -->
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm">
            <input v-model="includeCover" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Cover as the first page
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="titlePage" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Title page
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="tableOfContents" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Linked table of contents
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="volumeHeadings" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Volume headings
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="includeSynopsis" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Chapter synopses
          </label>
        </div>

        <!-- chapter selection -->
        <div>
          <div class="mb-2 flex items-center gap-2">
            <ListChecks :size="15" class="text-accent" />
            <span class="text-xs font-semibold uppercase tracking-wide text-ink-dim">Chapters</span>
            <span class="ml-auto text-xs text-ink-dim">
              {{ selected.size }} of {{ ordered.length }}
            </span>
          </div>

          <div class="mb-2 flex flex-wrap gap-1">
            <button
              v-for="st in STATUSES"
              :key="st.key"
              class="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors"
              :class="activeStatuses.has(st.key) ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="toggleStatus(st.key)"
            >
              <span class="h-2 w-2 rounded-full" :class="st.dot" />
              {{ st.label }}
            </button>
            <button class="ml-auto rounded-lg px-2 py-1 text-xs text-ink-dim hover:text-ink" @click="selectAll">
              All
            </button>
            <button class="rounded-lg px-2 py-1 text-xs text-ink-dim hover:text-ink" @click="selectNone">
              None
            </button>
          </div>

          <div class="max-h-48 overflow-auto rounded-xl border border-border">
            <label
              v-for="c in ordered"
              :key="c.id"
              class="flex cursor-pointer items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0 hover:bg-surface-2"
            >
              <input
                type="checkbox"
                class="h-3.5 w-3.5 shrink-0"
                style="accent-color: var(--color-accent)"
                :checked="selected.has(c.id)"
                @change="toggleChapter(c.id)"
              />
              <span class="h-2 w-2 shrink-0 rounded-full" :class="dotFor(c.status)" :title="c.status" />
              <span class="min-w-0 flex-1 truncate">{{ c.title }}</span>
              <span class="shrink-0 text-[10px] text-ink-dim">{{ c.volume }}</span>
            </label>
            <p v-if="!ordered.length" class="px-3 py-3 text-xs text-ink-dim">No chapters in this book.</p>
          </div>
        </div>

        <p v-if="done" class="flex items-start gap-2 break-all rounded-lg bg-accent-soft px-3 py-2 text-xs">
          <Check :size="14" class="mt-0.5 shrink-0 text-accent" />{{ done }}
        </p>
        <p v-if="error" class="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
        </p>
      </div>

      <div class="flex justify-end gap-2 border-t border-border px-6 py-4">
        <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="emit('close')">
          {{ done ? 'Close' : 'Cancel' }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
          :disabled="busy || !selected.size"
          @click="run"
        >
          <Loader2 v-if="busy" :size="15" class="animate-spin" />
          {{ busy ? 'Exporting…' : 'Export' }}
        </button>
      </div>
    </div>
  </div>
</template>
