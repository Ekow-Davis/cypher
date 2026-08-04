<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus,
  FileText,
  LayoutGrid,
  Rows3,
  FolderOpen,
  Trash2,
  Copy,
  Search,
  X,
  AlertCircle,
  ExternalLink
} from 'lucide-vue-next'
import { useDocumentsStore } from '@/stores/documents'
import { extractPlainText } from '@/lib/textStats'
import { usePreferencesStore } from '@/stores/preferences'

const store = useDocumentsStore()
const prefs = usePreferencesStore()
const router = useRouter()
const query = ref('')
const confirmDelete = ref<number | null>(null)

onMounted(() => {
  if (!store.loaded) void store.load()
})

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return store.docs
  return store.docs.filter((d) => d.title.toLowerCase().includes(q))
})

function preview(content: string): string {
  const text = extractPlainText(content).trim()
  return text ? text.slice(0, 160) : 'Empty document'
}
function words(content: string): number {
  const text = extractPlainText(content).trim()
  return text ? text.split(/\s+/).length : 0
}
function fmt(iso: string): string {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/** Imports a Word file as a brand-new document and opens it. */
async function importDoc(): Promise<void> {
  const result = await window.cypher.docs.importDocx()
  if (!result) return
  const created = await store.create()
  if (!created) return
  await store.rename(created.id, result.title)
  // Content is set by the editor, which parses the HTML into the document model.
  void router.push({ path: `/document/${created.id}`, query: { importHtml: '1' } })
  sessionStorage.setItem('cypher:pendingImport', result.html)
}

async function newDoc(): Promise<void> {
  const created = await store.create()
  if (created) void router.push(`/document/${created.id}`)
}
function openInWindow(id: number): void {
  void window.cypher.windows.open(`/document/${id}`)
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <header class="flex items-center gap-3 border-b border-border bg-surface px-6 py-4">
      <h1 class="text-xl font-bold">Documents</h1>
      <button
        class="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
        title="Import a Word document"
        @click="importDoc"
      >
        <FolderOpen :size="16" /> Import .docx
      </button>
      <button
        class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
        @click="newDoc"
      >
        <Plus :size="16" /> New document
      </button>
    </header>

    <div
      v-if="store.lastError"
      class="flex items-start gap-2 border-b border-red-500/40 bg-red-500/10 px-6 py-2 text-sm text-red-300"
    >
      <AlertCircle :size="16" class="mt-0.5 shrink-0" />
      <span class="flex-1">{{ store.lastError }}</span>
      <button class="shrink-0 hover:text-red-100" @click="store.clearError()"><X :size="15" /></button>
    </div>

    <div class="border-b border-border px-6 py-3">
      <div class="flex items-center gap-2">
      <div class="flex max-w-sm flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1.5">
        <Search :size="14" class="shrink-0 text-ink-dim" />
        <input
          v-model="query"
          placeholder="Search documents…"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
        />
        <button v-if="query" class="shrink-0 text-ink-dim hover:text-ink" @click="query = ''">
          <X :size="13" />
        </button>
      </div>

      <div class="ml-auto flex items-center gap-1 rounded-lg bg-surface-2 p-1">
        <button
          class="rounded-md p-1.5 transition-colors"
          :class="prefs.docsView === 'list' ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          title="List view"
          @click="prefs.setDocsView('list')"
        >
          <Rows3 :size="15" />
        </button>
        <button
          class="rounded-md p-1.5 transition-colors"
          :class="prefs.docsView === 'grid' ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          title="Grid view"
          @click="prefs.setDocsView('grid')"
        >
          <LayoutGrid :size="15" />
        </button>
      </div>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-6">
      <div v-if="!visible.length" class="flex h-full flex-col items-center justify-center text-ink-dim">
        <FileText :size="40" class="mb-3 opacity-50" />
        <p class="text-sm">{{ store.docs.length ? 'No documents match.' : 'No documents yet.' }}</p>
        <p class="text-xs">
          {{ store.docs.length ? 'Try a different search.' : 'Create one to start writing.' }}
        </p>
      </div>

      <!-- GRID -->
      <div
        v-else-if="prefs.docsView === 'grid'"
        class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4"
      >
        <div
          v-for="doc in visible"
          :key="doc.id"
          class="group flex cursor-pointer flex-col"
          @click="router.push(`/document/${doc.id}`)"
        >
          <div
            class="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-white p-3 shadow-sm transition-colors group-hover:border-accent-line"
          >
            <p class="line-clamp-[10] text-[8px] leading-[1.5] text-[#333]">
              {{ preview(doc.content) }}
            </p>
            <div
              class="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/55 py-1.5 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <button class="rounded p-1 text-white hover:text-accent" title="Open in new window" @click.stop="openInWindow(doc.id)">
                <ExternalLink :size="14" />
              </button>
              <button class="rounded p-1 text-white hover:text-accent" title="Duplicate" @click.stop="store.duplicate(doc.id)">
                <Copy :size="14" />
              </button>
              <button class="rounded p-1 text-white hover:text-red-400" title="Delete" @click.stop="confirmDelete = doc.id">
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
          <span class="mt-2 truncate text-sm font-medium">{{ doc.title }}</span>
          <span class="truncate text-[11px] text-ink-dim">
            {{ words(doc.content).toLocaleString() }} words · {{ fmt(doc.updated_at) }}
          </span>
        </div>
      </div>

      <!-- LIST -->
      <div v-else class="space-y-2">
        <div
          v-for="doc in visible"
          :key="doc.id"
          class="group flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent-line"
          @click="router.push(`/document/${doc.id}`)"
        >
          <FileText :size="18" class="mt-0.5 shrink-0 text-accent" />
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium">{{ doc.title }}</div>
            <p class="mt-0.5 line-clamp-2 text-xs text-ink-dim">{{ preview(doc.content) }}</p>
            <div class="mt-1 flex gap-3 text-[11px] text-ink-dim">
              <span>{{ words(doc.content).toLocaleString() }} words</span>
              <span>Edited {{ fmt(doc.updated_at) }}</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              class="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink"
              title="Open in new window"
              @click.stop="openInWindow(doc.id)"
            >
              <ExternalLink :size="15" />
            </button>
            <button
              class="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink"
              title="Duplicate"
              @click.stop="store.duplicate(doc.id)"
            >
              <Copy :size="15" />
            </button>
            <button
              class="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-red-400"
              title="Delete"
              @click.stop="confirmDelete = doc.id"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="confirmDelete !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="confirmDelete = null"
    >
      <div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-2 text-lg font-bold">Delete this document?</h2>
        <p class="mb-5 text-sm text-ink-dim">
          It moves to the trash, where it can be restored for the next few days.
        </p>
        <div class="flex justify-end gap-2">
          <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="confirmDelete = null">
            Cancel
          </button>
          <button
            class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            @click="store.remove(confirmDelete); confirmDelete = null"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
