<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChartLine,
  Plus,
  PenLine,
  Settings2,
  Search,
  X,
  LayoutGrid,
  Rows3,
  Folder,
  FolderPlus,
  Archive,
  ArchiveRestore,
  Library,
  Pencil,
  Trash2,
  ImagePlus,
  BookText
} from 'lucide-vue-next'
import { usePreferencesStore, type ShelfSort } from '@/stores/preferences'
import { useBooksStore } from '@/stores/books'
import { assetUrl } from '@/lib/assets'
import type { Book } from '@shared/types'
import BookMenu from './BookMenu.vue'

const prefs = usePreferencesStore()
const router = useRouter()
const store = useBooksStore()

onMounted(() => {
  void store.load()
})

// ---------- what the shelf is showing ----------

/** 'all' | 'loose' (no folder) | 'archived' | a folder id. */
type ShelfScope = 'all' | 'loose' | 'archived' | number
const scope = ref<ShelfScope>('all')
const query = ref('')

const SORTS: { v: ShelfSort; label: string }[] = [
  { v: 'edited', label: 'Recently edited' },
  { v: 'created', label: 'Newest first' },
  { v: 'title', label: 'Title A–Z' }
]

function stamp(iso: string | undefined): number {
  if (!iso) return 0
  return new Date(iso.replace(' ', 'T') + 'Z').getTime() || 0
}

const inScope = computed<Book[]>(() => {
  const s = scope.value
  if (s === 'archived') return store.archived
  if (s === 'all') return store.active
  if (s === 'loose') return store.active.filter((b) => b.folder_id == null)
  return store.active.filter((b) => b.folder_id === s)
})

const visible = computed<Book[]>(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? inScope.value.filter((b) =>
        [b.title, b.subtitle, b.author, b.genre, b.synopsis]
          .filter(Boolean)
          .some((t) => (t as string).toLowerCase().includes(q))
      )
    : [...inScope.value]
  if (prefs.shelfSort === 'title')
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }))
  else if (prefs.shelfSort === 'created') list.sort((a, b) => stamp(b.created_at) - stamp(a.created_at))
  else list.sort((a, b) => stamp(b.last_edited ?? b.created_at) - stamp(a.last_edited ?? a.created_at))
  return list
})

const countFor = (folderId: number): number =>
  store.active.filter((b) => b.folder_id === folderId).length
const looseCount = computed(() => store.active.filter((b) => b.folder_id == null).length)

const currentFolder = computed(() =>
  typeof scope.value === 'number' ? store.folders.find((f) => f.id === scope.value) ?? null : null
)

const scopeTitle = computed(() => {
  if (scope.value === 'archived') return 'Archived'
  if (scope.value === 'loose') return 'Not in a folder'
  return currentFolder.value?.name ?? 'Your Books'
})

function folderName(id: number | null | undefined): string | null {
  if (id == null) return null
  return store.folders.find((f) => f.id === id)?.name ?? null
}

function fmtDate(iso: string | undefined): string {
  const t = stamp(iso)
  if (!t) return '—'
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', ongoing: 'Ongoing', complete: 'Complete' }

// ---------- folders ----------

const folderDraft = ref<string | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
/** When a folder is made from a book's menu, that book goes straight into it. */
let moveIntoNewFolder: number | null = null

async function startNewFolder(forBook: number | null = null): Promise<void> {
  moveIntoNewFolder = forBook
  folderDraft.value = ''
  await nextTick()
  folderInput.value?.focus()
}

async function commitNewFolder(): Promise<void> {
  const name = folderDraft.value?.trim()
  folderDraft.value = null
  if (!name) {
    moveIntoNewFolder = null
    return
  }
  const folder = await store.createFolder(name)
  if (moveIntoNewFolder != null) await store.moveToFolder(moveIntoNewFolder, folder.id)
  moveIntoNewFolder = null
  scope.value = folder.id
}

const renaming = ref<string | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)
async function startRename(): Promise<void> {
  if (!currentFolder.value) return
  renaming.value = currentFolder.value.name
  await nextTick()
  renameInput.value?.select()
}
async function commitRename(): Promise<void> {
  const name = renaming.value?.trim()
  renaming.value = null
  if (name && currentFolder.value) await store.renameFolder(currentFolder.value.id, name)
}

const confirmFolderDelete = ref(false)
async function deleteCurrentFolder(): Promise<void> {
  if (!currentFolder.value) return
  await store.deleteFolder(currentFolder.value.id)
  confirmFolderDelete.value = false
  scope.value = 'all'
}

// ---------- drag a book onto a folder ----------

const dragOver = ref<ShelfScope | null>(null)

function onDragStart(e: DragEvent, book: Book): void {
  e.dataTransfer?.setData('application/x-cypher-book', String(book.id))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOverTarget(e: DragEvent, target: ShelfScope): void {
  if (!e.dataTransfer?.types.includes('application/x-cypher-book')) return
  e.preventDefault()
  dragOver.value = target
}
async function onDrop(e: DragEvent, target: ShelfScope): Promise<void> {
  dragOver.value = null
  const id = Number(e.dataTransfer?.getData('application/x-cypher-book'))
  const book = store.all.find((b) => b.id === id)
  if (!book) return
  if (target === 'archived') {
    if (!book.archived) await store.archive(id, true)
    return
  }
  // Dropping an archived book anywhere else brings it back to the shelf.
  if (book.archived) await store.archive(id, false)
  if (target === 'all') return
  await store.moveToFolder(id, target === 'loose' ? null : target)
}

// ---------- create ----------

const showCreate = ref(false)
const newTitle = ref('')
const newSubtitle = ref('')
const newCover = ref<string | null>(null)
const newFolderId = ref<number | null>(null)
const creating = ref(false)
const pickingCover = ref(false)

function openCreate(): void {
  newTitle.value = ''
  newSubtitle.value = ''
  newCover.value = null
  // Creating from inside a folder puts the book there.
  newFolderId.value = typeof scope.value === 'number' ? scope.value : null
  showCreate.value = true
}

async function pickCover(): Promise<void> {
  if (pickingCover.value) return
  pickingCover.value = true
  try {
    const coverRef = await window.cypher.books.importCover()
    if (coverRef) newCover.value = coverRef
  } finally {
    pickingCover.value = false
  }
}

async function confirmCreate(): Promise<void> {
  if (!newTitle.value.trim() || creating.value) return
  creating.value = true
  try {
    const book = await store.create({
      title: newTitle.value.trim(),
      subtitle: newSubtitle.value.trim() || null,
      cover_path: newCover.value,
      folder_id: newFolderId.value
    })
    showCreate.value = false
    void router.push(`/book/${book.id}`)
  } finally {
    creating.value = false
  }
}

const chipBase =
  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors'
function chipClass(target: ShelfScope): string {
  if (dragOver.value === target) return `${chipBase} border-accent bg-accent-soft text-accent`
  return scope.value === target
    ? `${chipBase} border-accent-line bg-accent-soft text-accent`
    : `${chipBase} border-border text-ink-dim hover:text-ink`
}
</script>

<template>
  <section class="px-10 py-10">
    <header class="mb-6 flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">Public</p>
        <div v-if="renaming !== null" class="flex items-center gap-2">
          <input
            ref="renameInput"
            v-model="renaming"
            class="min-w-0 rounded-lg border border-accent-line bg-surface-2 px-2 py-0.5 text-3xl font-bold outline-none"
            @keydown.enter="commitRename"
            @keydown.esc="renaming = null"
            @blur="commitRename"
          />
        </div>
        <h1 v-else class="truncate text-3xl font-bold">{{ scopeTitle }}</h1>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <template v-if="currentFolder && renaming === null">
          <button
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-ink-dim hover:bg-surface-2 hover:text-ink"
            title="Rename this folder"
            @click="startRename"
          >
            <Pencil :size="13" /> Rename
          </button>
          <button
            v-if="!confirmFolderDelete"
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-ink-dim hover:bg-surface-2 hover:text-red-400"
            title="Delete this folder (its books stay on the shelf)"
            @click="confirmFolderDelete = true"
          >
            <Trash2 :size="13" /> Delete folder
          </button>
          <span v-else class="flex items-center gap-1 text-xs">
            <span class="text-ink-dim">Books stay on the shelf.</span>
            <button class="rounded-lg px-2 py-1.5 font-medium text-red-400 hover:bg-red-500/10" @click="deleteCurrentFolder">
              Delete
            </button>
            <button class="rounded-lg px-2 py-1.5 text-ink-dim hover:text-ink" @click="confirmFolderDelete = false">
              Cancel
            </button>
          </span>
        </template>
        <p class="text-sm text-ink-dim">
          {{ visible.length }} {{ visible.length === 1 ? 'book' : 'books' }}
        </p>
      </div>
    </header>

    <!-- scope chips: drop a book on one to move it there -->
    <div class="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
      <button
        :class="chipClass('all')"
        @click="scope = 'all'"
        @dragover="onDragOverTarget($event, 'all')"
        @dragleave="dragOver = null"
        @drop="onDrop($event, 'all')"
      >
        <Library :size="13" /> All <span class="tabular-nums opacity-70">{{ store.active.length }}</span>
      </button>
      <button
        v-if="store.folders.length"
        :class="chipClass('loose')"
        title="Books not in any folder"
        @click="scope = 'loose'"
        @dragover="onDragOverTarget($event, 'loose')"
        @dragleave="dragOver = null"
        @drop="onDrop($event, 'loose')"
      >
        <BookText :size="13" /> No folder <span class="tabular-nums opacity-70">{{ looseCount }}</span>
      </button>
      <button
        v-for="f in store.folders"
        :key="f.id"
        :class="chipClass(f.id)"
        @click="scope = f.id"
        @dblclick="scope = f.id; startRename()"
        @dragover="onDragOverTarget($event, f.id)"
        @dragleave="dragOver = null"
        @drop="onDrop($event, f.id)"
      >
        <Folder :size="13" /> {{ f.name }}
        <span class="tabular-nums opacity-70">{{ countFor(f.id) }}</span>
      </button>

      <input
        v-if="folderDraft !== null"
        ref="folderInput"
        v-model="folderDraft"
        placeholder="Folder name"
        class="w-36 shrink-0 rounded-full border border-accent-line bg-surface-2 px-3 py-1 text-xs outline-none"
        @keydown.enter="commitNewFolder"
        @keydown.esc="folderDraft = null"
        @blur="commitNewFolder"
      />
      <button
        v-else
        class="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-ink-dim hover:text-ink"
        title="New folder"
        @click="startNewFolder()"
      >
        <FolderPlus :size="14" /> Folder
      </button>

      <span class="mx-1 h-4 w-px shrink-0 bg-border" />
      <button
        :class="chipClass('archived')"
        title="Archived books — drop a book here to archive it"
        @click="scope = 'archived'"
        @dragover="onDragOverTarget($event, 'archived')"
        @dragleave="dragOver = null"
        @drop="onDrop($event, 'archived')"
      >
        <Archive :size="13" /> Archived
        <span class="tabular-nums opacity-70">{{ store.archived.length }}</span>
      </button>
    </div>

    <!-- search, sort, view -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <div class="flex min-w-[14rem] max-w-sm flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1.5">
        <Search :size="14" class="shrink-0 text-ink-dim" />
        <input
          v-model="query"
          placeholder="Search title, author, genre…"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
        />
        <button v-if="query" class="shrink-0 text-ink-dim hover:text-ink" @click="query = ''">
          <X :size="13" />
        </button>
      </div>

      <select
        class="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-ink-dim outline-none hover:text-ink focus:border-accent-line"
        :value="prefs.shelfSort"
        title="Sort"
        @change="prefs.setShelfSort(($event.target as HTMLSelectElement).value as ShelfSort)"
      >
        <option v-for="s in SORTS" :key="s.v" :value="s.v">{{ s.label }}</option>
      </select>

      <div class="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
        <button
          class="rounded-md p-1.5 transition-colors"
          :class="prefs.shelfView === 'grid' ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          title="Cover view"
          @click="prefs.setShelfView('grid')"
        >
          <LayoutGrid :size="15" />
        </button>
        <button
          class="rounded-md p-1.5 transition-colors"
          :class="prefs.shelfView === 'list' ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          title="List view"
          @click="prefs.setShelfView('list')"
        >
          <Rows3 :size="15" />
        </button>
      </div>

      <button
        v-if="scope !== 'archived'"
        class="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent"
        @click="openCreate"
      >
        <Plus :size="15" /> New book
      </button>
    </div>

    <!-- empty states -->
    <div
      v-if="!visible.length && (query || scope === 'archived' || store.active.length)"
      class="flex flex-col items-center justify-center py-20 text-center text-ink-dim"
    >
      <component :is="scope === 'archived' ? Archive : Folder" :size="40" class="mb-3 opacity-50" />
      <p class="text-sm">
        <template v-if="query">No books match “{{ query }}”.</template>
        <template v-else-if="scope === 'archived'">Nothing archived.</template>
        <template v-else-if="currentFolder">This folder is empty.</template>
        <template v-else>No books here.</template>
      </p>
      <p v-if="!query && scope === 'archived'" class="text-xs">
        Archive a book from its ⋯ menu, or drag it onto Archived.
      </p>
      <p v-else-if="!query && currentFolder" class="text-xs">
        Drag books onto the folder above, or use a book's ⋯ menu → Move to folder.
      </p>
    </div>

    <!-- GRID -->
    <div
      v-else-if="prefs.shelfView === 'grid'"
      class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-6"
    >
      <button
        v-if="scope !== 'archived' && !query"
        class="group flex aspect-[2/3] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border text-ink-dim transition-colors hover:border-accent-line hover:text-ink"
        @click="openCreate"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 transition-colors group-hover:bg-accent-soft"
        >
          <Plus :size="24" />
        </div>
        <span class="text-sm font-medium">Create book</span>
      </button>

      <div
        v-for="book in visible"
        :key="book.id"
        class="group relative"
        draggable="true"
        @dragstart="onDragStart($event, book)"
      >
        <div
          class="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
          :class="book.archived ? 'opacity-70' : ''"
        >
          <img
            v-if="assetUrl(book.cover_path)"
            :src="assetUrl(book.cover_path) as string"
            :alt="book.title"
            class="h-full w-full object-cover"
            draggable="false"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-accent-soft p-4 text-center"
          >
            <span class="font-script text-lg font-semibold text-ink">{{ book.title }}</span>
          </div>

          <div
            v-if="assetUrl(book.cover_path)"
            class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity group-hover:opacity-0"
          >
            <p class="truncate text-sm font-semibold text-white">{{ book.title }}</p>
          </div>

          <div
            class="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <p class="w-full truncate text-center text-[11px] text-white/80">
              {{ (book.word_count ?? 0).toLocaleString() }} words · {{ fmtDate(book.last_edited) }}
            </p>
            <button
              v-if="book.archived"
              class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-sm font-semibold text-on-accent"
              @click="store.archive(book.id, false)"
            >
              <ArchiveRestore :size="16" /> Unarchive
            </button>
            <button
              v-else
              class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-sm font-semibold text-on-accent"
              @click="router.push(`/book/${book.id}`)"
            >
              <PenLine :size="16" /> Write
            </button>
            <button
              class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/15 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
              @click="router.push(`/book/${book.id}/settings`)"
            >
              <Settings2 :size="16" /> Manage
            </button>
          </div>
        </div>

        <!-- outside the clipped cover so its menu can spill over -->
        <div class="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <BookMenu :book="book" light @new-folder="startNewFolder" />
        </div>
        <p
          v-if="scope === 'all' && folderName(book.folder_id)"
          class="mt-1.5 flex items-center gap-1 truncate text-[11px] text-ink-dim"
        >
          <Folder :size="11" class="shrink-0" /> {{ folderName(book.folder_id) }}
        </p>
      </div>
    </div>

    <!-- LIST -->
    <div v-else class="overflow-hidden rounded-2xl border border-border">
      <div
        class="grid grid-cols-[3rem_minmax(0,1fr)_8rem_6rem_5rem_7rem_6.5rem] items-center gap-3 border-b border-border bg-surface-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim"
      >
        <span />
        <span>Title</span>
        <span>Folder</span>
        <span class="text-right">Words</span>
        <span class="text-right">Chapters</span>
        <span>Edited</span>
        <span />
      </div>
      <div
        v-for="book in visible"
        :key="book.id"
        class="group grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_8rem_6rem_5rem_7rem_6.5rem] items-center gap-3 border-b border-border bg-surface px-4 py-2 transition-colors last:border-b-0 hover:bg-surface-2"
        :class="book.archived ? 'opacity-70' : ''"
        draggable="true"
        @dragstart="onDragStart($event, book)"
        @click="book.archived ? router.push(`/book/${book.id}/settings`) : router.push(`/book/${book.id}`)"
      >
        <div class="h-[4.25rem] w-12 overflow-hidden rounded-md border border-border">
          <img
            v-if="assetUrl(book.cover_path)"
            :src="assetUrl(book.cover_path) as string"
            :alt="book.title"
            class="h-full w-full object-cover"
            draggable="false"
          />
          <div v-else class="h-full w-full bg-gradient-to-br from-surface-2 to-accent-soft" />
        </div>
        <div class="min-w-0">
          <div class="truncate font-medium">{{ book.title }}</div>
          <div class="flex items-center gap-2 truncate text-xs text-ink-dim">
            <span v-if="book.subtitle" class="truncate">{{ book.subtitle }}</span>
            <span v-if="book.author" class="truncate">by {{ book.author }}</span>
            <span class="shrink-0 rounded-full bg-surface-2 px-1.5 py-px text-[10px]">
              {{ STATUS_LABEL[book.status] ?? book.status }}
            </span>
          </div>
        </div>
        <span class="truncate text-xs text-ink-dim">
          <template v-if="folderName(book.folder_id)">
            <Folder :size="11" class="mr-0.5 inline" /> {{ folderName(book.folder_id) }}
          </template>
          <template v-else>—</template>
        </span>
        <span class="text-right text-xs tabular-nums text-ink-dim">
          {{ (book.word_count ?? 0).toLocaleString() }}
        </span>
        <span class="text-right text-xs tabular-nums text-ink-dim">{{ book.chapter_count ?? 0 }}</span>
        <span class="text-xs text-ink-dim">{{ fmtDate(book.last_edited) }}</span>
        <div class="flex items-center justify-end gap-1" @click.stop>
          <button
            v-if="book.archived"
            class="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
            @click="store.archive(book.id, false)"
          >
            Unarchive
          </button>
          <button
            v-else
            class="rounded-md p-1.5 text-ink-dim opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
            title="Write"
            @click="router.push(`/book/${book.id}`)"
          >
            <PenLine :size="15" />
          </button>
          <BookMenu :book="book" @new-folder="startNewFolder" />
        </div>
      </div>
    </div>

    <!-- create modal -->
    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="showCreate = false"
    >
      <div class="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-4 text-xl font-bold">Create a book</h2>

        <div class="flex gap-5">
          <!-- optional cover -->
          <div class="w-28 shrink-0">
            <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
              Cover
            </label>
            <button
              class="group relative flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border text-ink-dim transition-colors hover:border-accent-line hover:text-ink"
              :class="newCover ? 'border-solid' : ''"
              :disabled="pickingCover"
              :title="newCover ? 'Change cover' : 'Choose a cover image'"
              @click="pickCover"
            >
              <img
                v-if="newCover"
                :src="assetUrl(newCover) as string"
                alt="Cover"
                class="h-full w-full object-cover"
              />
              <span v-else class="flex flex-col items-center gap-1 px-2 text-center text-[11px]">
                <ImagePlus :size="20" />
                {{ pickingCover ? 'Choosing…' : 'Add cover' }}
              </span>
            </button>
            <button
              v-if="newCover"
              class="mt-1 w-full text-center text-[11px] text-ink-dim hover:text-ink"
              @click="newCover = null"
            >
              Remove
            </button>
            <p v-else class="mt-1 text-center text-[10px] text-ink-dim">Optional</p>
          </div>

          <div class="min-w-0 flex-1">
            <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
              Title
            </label>
            <input
              v-model="newTitle"
              type="text"
              placeholder="Untitled"
              class="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-ink outline-none focus:border-accent-line"
              @keydown.enter="confirmCreate"
            />

            <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
              Subtitle (optional)
            </label>
            <input
              v-model="newSubtitle"
              type="text"
              class="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-ink outline-none focus:border-accent-line"
              @keydown.enter="confirmCreate"
            />

            <template v-if="store.folders.length">
              <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
                Folder (optional)
              </label>
              <select
                v-model="newFolderId"
                class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent-line"
              >
                <option :value="null">No folder</option>
                <option v-for="f in store.folders" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
            </template>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink"
            @click="showCreate = false"
          >
            Cancel
          </button>
          <button
            class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
            :disabled="!newTitle.trim() || creating"
            @click="confirmCreate"
          >
            Create
          </button>
        </div>
      </div>
    </div>

    <!-- writing stats, once switched on -->
    <button
      v-if="prefs.statsEnabled"
      class="fixed bottom-5 left-24 z-30 flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium shadow-lg transition-transform hover:-translate-y-0.5 hover:border-accent-line"
      title="Your writing stats"
      @click="$router.push('/stats')"
    >
      <ChartLine :size="16" class="text-accent" /> Stats
    </button>
  </section>
</template>
