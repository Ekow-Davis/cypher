<script setup lang="ts">
/**
 * The shared lore library, seen from inside a book.
 *
 * Tick whole categories or single entries and copy them into this book.
 * Entries this book already has a copy of are updated rather than doubled.
 * The library can also be tidied here: rename, recategorise, remove.
 */
import { ref, computed, onMounted } from 'vue'
import {
  LibraryBig,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  Trash2,
  Pencil,
  BookCheck
} from 'lucide-vue-next'
import { useLibraryStore } from '@/stores/library'
import { useLoreStore } from '@/stores/lore'
import { extractPlainText } from '@/lib/textStats'

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ close: [] }>()

const library = useLibraryStore()
const lore = useLoreStore()

const query = ref('')
const picked = ref<Set<number>>(new Set())
const collapsed = ref<Set<string>>(new Set())
const focusId = ref<number | null>(null)
const keepCategories = ref(true)
const intoCategory = ref(lore.active?.category ?? 'General')
const busy = ref(false)
const result = ref<string | null>(null)
const editing = ref<{ id: number; title: string; category: string } | null>(null)
const confirmDelete = ref<number | null>(null)

onMounted(() => void library.load())

const linkedHere = computed(() => new Set(lore.entries.map((e) => e.library_id).filter(Boolean) as number[]))

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const map = new Map<string, typeof library.entries>()
  for (const e of library.entries) {
    if (q && !e.title.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) continue
    const list = map.get(e.category) ?? []
    list.push(e)
    map.set(e.category, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, items]) => ({ category, items }))
})

const focused = computed(() => library.entries.find((e) => e.id === focusId.value) ?? null)
const preview = computed(() => {
  if (!focused.value) return ''
  const text = extractPlainText(focused.value.content).replace(/\s+/g, ' ').trim()
  return text.length > 900 ? `${text.slice(0, 900)}…` : text
})

const pickedList = computed(() => library.entries.filter((e) => picked.value.has(e.id)))
const willUpdate = computed(() => pickedList.value.filter((e) => linkedHere.value.has(e.id)).length)

function togglePick(id: number): void {
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}

function groupState(items: { id: number }[]): 'all' | 'some' | 'none' {
  const n = items.filter((i) => picked.value.has(i.id)).length
  return n === 0 ? 'none' : n === items.length ? 'all' : 'some'
}

function toggleGroup(items: { id: number }[]): void {
  const next = new Set(picked.value)
  const all = groupState(items) === 'all'
  for (const i of items) {
    if (all) next.delete(i.id)
    else next.add(i.id)
  }
  picked.value = next
}

function toggleCollapse(category: string): void {
  const next = new Set(collapsed.value)
  if (next.has(category)) next.delete(category)
  else next.add(category)
  collapsed.value = next
}

async function doImport(): Promise<void> {
  if (!picked.value.size) return
  busy.value = true
  result.value = null
  try {
    const out = await library.importInto(
      props.bookId,
      [...picked.value],
      keepCategories.value ? null : intoCategory.value.trim() || 'General'
    )
    if (out.firstId != null) lore.setActive(out.firstId)
    const parts: string[] = []
    if (out.created) parts.push(`added ${out.created}`)
    if (out.updated) parts.push(`updated ${out.updated}`)
    result.value = `Done — ${parts.join(', ')}.`
    picked.value = new Set()
  } finally {
    busy.value = false
  }
}

async function saveEdit(): Promise<void> {
  if (!editing.value) return
  await library.rename(editing.value.id, editing.value.title, editing.value.category)
  editing.value = null
}

async function doDelete(id: number): Promise<void> {
  await library.remove(id)
  confirmDelete.value = null
  if (focusId.value === id) focusId.value = null
  const next = new Set(picked.value)
  next.delete(id)
  picked.value = next
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-surface">
      <div class="flex items-center gap-2 border-b border-border px-6 py-4">
        <LibraryBig :size="18" class="text-accent" />
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold">Lore library</h2>
          <p class="text-sm text-ink-dim">
            Lore shared between your books. Copy whole categories or single entries into this one.
          </p>
        </div>
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- list -->
        <div class="flex w-1/2 min-w-0 flex-col border-r border-border">
          <div class="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <Search :size="14" class="text-ink-dim" />
            <input v-model="query" placeholder="Filter library…" class="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div class="flex-1 overflow-auto py-2">
            <div v-if="!library.loaded" class="px-4 py-6 text-center text-xs text-ink-dim">Loading…</div>
            <div v-else-if="!library.entries.length" class="px-5 py-8 text-center text-sm text-ink-dim">
              The library is empty. Open any lore entry and use <strong>Add to library</strong> in its
              toolbar, or the library button on a category, to start sharing lore between books.
            </div>
            <div v-for="g in groups" :key="g.category" class="mb-1">
              <div class="mx-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-ink-dim hover:bg-surface-2">
                <button class="shrink-0 rounded p-0.5 hover:text-ink" @click="toggleCollapse(g.category)">
                  <component :is="collapsed.has(g.category) ? ChevronRight : ChevronDown" :size="13" />
                </button>
                <button
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  :class="groupState(g.items) === 'none' ? 'border-border' : 'border-accent bg-accent text-on-accent'"
                  :title="groupState(g.items) === 'all' ? 'Untick the whole category' : 'Tick the whole category'"
                  @click="toggleGroup(g.items)"
                >
                  <Check v-if="groupState(g.items) === 'all'" :size="11" />
                  <span v-else-if="groupState(g.items) === 'some'" class="h-0.5 w-2 bg-on-accent" />
                </button>
                <span class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide">{{ g.category }}</span>
                <span class="text-[10px]">{{ g.items.length }}</span>
              </div>
              <div v-show="!collapsed.has(g.category)" class="pl-7">
                <div
                  v-for="e in g.items"
                  :key="e.id"
                  class="group/row mx-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5"
                  :class="focusId === e.id ? 'bg-surface-2' : 'hover:bg-surface-2'"
                  @click="focusId = e.id"
                >
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 shrink-0"
                    style="accent-color: var(--color-accent)"
                    :checked="picked.has(e.id)"
                    @click.stop
                    @change="togglePick(e.id)"
                  />
                  <span class="min-w-0 flex-1 truncate text-sm">{{ e.title }}</span>
                  <BookCheck
                    v-if="linkedHere.has(e.id)"
                    :size="13"
                    class="shrink-0 text-accent"
                    title="This book already has a copy — importing updates it"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- preview / manage -->
        <div class="flex w-1/2 min-w-0 flex-col">
          <div v-if="focused" class="flex-1 overflow-auto p-5">
            <template v-if="editing && editing.id === focused.id">
              <label class="mb-2 block">
                <span class="mb-0.5 block text-[11px] text-ink-dim">Title</span>
                <input v-model="editing.title" class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line" />
              </label>
              <label class="mb-3 block">
                <span class="mb-0.5 block text-[11px] text-ink-dim">Category</span>
                <input v-model="editing.category" class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line" />
              </label>
              <div class="flex justify-end gap-2">
                <button class="rounded-lg px-2.5 py-1 text-xs text-ink-dim hover:text-ink" @click="editing = null">Cancel</button>
                <button class="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-on-accent" @click="saveEdit">Save</button>
              </div>
            </template>
            <template v-else>
              <div class="mb-1 flex items-start gap-2">
                <h3 class="min-w-0 flex-1 text-lg font-semibold">{{ focused.title }}</h3>
                <button class="rounded p-1 text-ink-dim hover:text-ink" title="Rename or recategorise" @click="editing = { id: focused.id, title: focused.title, category: focused.category }">
                  <Pencil :size="14" />
                </button>
                <button class="rounded p-1 text-ink-dim hover:text-red-400" title="Remove from library" @click="confirmDelete = focused.id">
                  <Trash2 :size="14" />
                </button>
              </div>
              <div class="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-dim">
                <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ focused.category }}</span>
                <span>Updated {{ new Date(focused.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString() }}</span>
                <span v-if="linkedHere.has(focused.id)" class="text-accent">In this book</span>
              </div>
              <div v-if="confirmDelete === focused.id" class="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs">
                Remove <strong>{{ focused.title }}</strong> from the library? Copies already in your books stay.
                <div class="mt-2 flex justify-end gap-2">
                  <button class="rounded-lg px-2 py-1 text-ink-dim hover:text-ink" @click="confirmDelete = null">Keep</button>
                  <button class="rounded-lg bg-red-500 px-2.5 py-1 font-semibold text-white" @click="doDelete(focused.id)">Remove</button>
                </div>
              </div>
              <p class="whitespace-pre-line text-sm leading-relaxed text-ink-dim">{{ preview || 'This entry is empty.' }}</p>
            </template>
          </div>
          <div v-else class="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-dim">
            Click an entry to preview it. Tick entries or whole categories to copy them in.
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="keepCategories" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
          Keep library categories
        </label>
        <input
          v-if="!keepCategories"
          v-model="intoCategory"
          list="library-into-categories"
          placeholder="Category"
          class="w-40 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
        />
        <datalist id="library-into-categories">
          <option v-for="c in lore.categoryNames" :key="c" :value="c" />
        </datalist>
        <span v-if="result" class="text-xs text-accent">{{ result }}</span>
        <span class="flex-1" />
        <button class="rounded-lg px-3 py-1.5 text-sm text-ink-dim hover:text-ink" @click="emit('close')">Close</button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
          :disabled="!picked.size || busy"
          @click="doImport"
        >
          <Loader2 v-if="busy" :size="14" class="animate-spin" />
          Copy {{ picked.size || '' }} into this book
          <span v-if="willUpdate" class="font-normal opacity-80">({{ willUpdate }} update)</span>
        </button>
      </div>
    </div>
  </div>
</template>
