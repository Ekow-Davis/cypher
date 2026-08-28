<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { FileText, FileType, Loader2, Check, AlertCircle, ListChecks } from 'lucide-vue-next'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import { usePreferencesStore } from '@/stores/preferences'
import { useBooksStore } from '@/stores/books'
import type { SectionKind } from '@shared/types'

const props = defineProps<{ bookId: number; kind: SectionKind }>()
const emit = defineEmits<{ close: [] }>()

const lore = useLoreStore()
const characters = useCharactersStore()
const prefs = usePreferencesStore()
const books = useBooksStore()

const format = ref<'docx' | 'pdf'>('docx')
const author = ref('')
const titlePage = ref(true)
const tableOfContents = ref(true)
const groupHeadings = ref(true)
const includeEmptyFields = ref(false)
const includePortraits = ref(true)
const busy = ref(false)
const done = ref<string | null>(null)
const error = ref<string | null>(null)

const isLore = computed(() => props.kind === 'lore')
const heading = computed(() => (isLore.value ? 'Export lore' : 'Export characters'))
const groupWord = computed(() => (isLore.value ? 'Categories' : 'Cast groups'))

/** Entries grouped the way they'll appear in the document. */
const groups = computed(() => {
  if (isLore.value) {
    return lore.groups.map((g) => ({
      name: g.category,
      items: g.items.map((e) => ({ id: e.id, title: e.title }))
    }))
  }
  return characters.groups.map((g) => ({
    name: g.folder,
    items: g.items.map((c) => ({ id: c.id, title: c.name }))
  }))
})
const allIds = computed(() => groups.value.flatMap((g) => g.items.map((i) => i.id)))

const activeGroups = ref<Set<string>>(new Set())
const selected = ref<Set<number>>(new Set())

function syncFromGroups(): void {
  selected.value = new Set(
    groups.value.filter((g) => activeGroups.value.has(g.name)).flatMap((g) => g.items.map((i) => i.id))
  )
}
function toggleGroup(name: string): void {
  const next = new Set(activeGroups.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  activeGroups.value = next
  syncFromGroups()
}
function toggleItem(id: number): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function selectAll(): void {
  activeGroups.value = new Set(groups.value.map((g) => g.name))
  selected.value = new Set(allIds.value)
}
function selectNone(): void {
  activeGroups.value = new Set()
  selected.value = new Set()
}

watch(groups, selectAll, { immediate: true })
onMounted(() => {
  const book = books.books.find((b) => b.id === props.bookId)
  author.value = book?.author?.trim() || prefs.defaultAuthor
})

async function run(): Promise<void> {
  busy.value = true
  done.value = null
  error.value = null
  try {
    const res = await window.cypher.exporter.section(props.bookId, props.kind, format.value, {
      author: author.value,
      titlePage: titlePage.value,
      tableOfContents: tableOfContents.value,
      groupHeadings: groupHeadings.value,
      includeEmptyFields: includeEmptyFields.value,
      includePortraits: includePortraits.value,
      ids: [...selected.value]
    })
    if (res.cancelled) {
      busy.value = false
      return
    }
    if (res.error) error.value = res.error
    else {
      done.value = `Exported ${res.chapters} entr${res.chapters === 1 ? 'y' : 'ies'} to ${res.path}`
      // Close on its own once the writer has had a moment to see where it
      // landed — an export that succeeded needs no further decision from them.
      setTimeout(() => emit('close'), 1400)
    }
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
        <h2 class="text-lg font-bold">{{ heading }}</h2>
        <p class="text-sm text-ink-dim">
          Grouped by {{ isLore ? 'category' : 'cast group' }}, with a linked contents page.
        </p>
      </div>

      <div class="flex-1 space-y-5 overflow-auto px-6 py-4">
        <div class="grid grid-cols-2 gap-1">
          <button
            class="flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors"
            :class="format === 'docx' ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'"
            @click="format = 'docx'"
          >
            <FileText :size="17" :class="format === 'docx' ? 'text-accent' : 'text-ink-dim'" />
            <span class="text-sm font-medium">Word</span>
          </button>
          <button
            class="flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors"
            :class="format === 'pdf' ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'"
            @click="format = 'pdf'"
          >
            <FileType :size="17" :class="format === 'pdf' ? 'text-accent' : 'text-ink-dim'" />
            <span class="text-sm font-medium">PDF</span>
          </button>
        </div>

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

        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm">
            <input v-model="titlePage" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Title page
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="tableOfContents" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Linked table of contents
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="groupHeadings" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            {{ isLore ? 'Category' : 'Cast group' }} headings
          </label>
          <label v-if="!isLore" class="flex items-center gap-2 text-sm">
            <input v-model="includePortraits" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Include portraits
          </label>
          <label v-if="!isLore" class="flex items-center gap-2 text-sm">
            <input v-model="includeEmptyFields" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Include blank fields
          </label>
        </div>

        <div>
          <div class="mb-2 flex items-center gap-2">
            <ListChecks :size="15" class="text-accent" />
            <span class="text-xs font-semibold uppercase tracking-wide text-ink-dim">
              {{ groupWord }}
            </span>
            <span class="ml-auto text-xs text-ink-dim">{{ selected.size }} of {{ allIds.length }}</span>
          </div>

          <div class="mb-2 flex flex-wrap gap-1">
            <button
              v-for="g in groups"
              :key="g.name"
              class="rounded-lg border px-2 py-1 text-xs"
              :class="activeGroups.has(g.name) ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="toggleGroup(g.name)"
            >
              {{ g.name }} <span class="text-ink-dim">{{ g.items.length }}</span>
            </button>
            <button class="ml-auto rounded-lg px-2 py-1 text-xs text-ink-dim hover:text-ink" @click="selectAll">All</button>
            <button class="rounded-lg px-2 py-1 text-xs text-ink-dim hover:text-ink" @click="selectNone">None</button>
          </div>

          <div class="max-h-48 overflow-auto rounded-xl border border-border">
            <template v-for="g in groups" :key="g.name">
              <div class="bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                {{ g.name }}
              </div>
              <label
                v-for="item in g.items"
                :key="item.id"
                class="flex cursor-pointer items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0 hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 shrink-0"
                  style="accent-color: var(--color-accent)"
                  :checked="selected.has(item.id)"
                  @change="toggleItem(item.id)"
                />
                <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
              </label>
            </template>
            <p v-if="!allIds.length" class="px-3 py-3 text-xs text-ink-dim">Nothing to export yet.</p>
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
