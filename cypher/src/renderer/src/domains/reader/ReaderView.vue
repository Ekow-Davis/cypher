<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ImagePlus, Copy, Check, BookOpen, Info, X, ExternalLink } from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { assetUrl } from '@/lib/assets'
import EpubReader from './EpubReader.vue'
import type { ReaderItem } from '@shared/types'

const route = useRoute()
const router = useRouter()
const store = useReaderStore()
const { isTight } = useBreakpoint()

const id = Number(route.params.id)
const title = ref('')
const author = ref('')
const copied = ref(false)
const showDetails = ref(false)

/** Read alongside writing: this book in its own window. */
function openInNewWindow(): void {
  void window.cypher.windows.open(`/reader/${id}`)
}

const item = computed<ReaderItem | null>(() => store.getById(id))

onMounted(async () => {
  if (!store.loaded) await store.load()
  if (item.value) {
    title.value = item.value.title
    author.value = item.value.author ?? ''
  }
})

async function commitTitle(): Promise<void> {
  if (item.value && title.value.trim() && title.value !== item.value.title) {
    await store.rename(item.value.id, title.value.trim())
  }
}
async function commitAuthor(): Promise<void> {
  if (item.value && author.value !== (item.value.author ?? '')) {
    await store.setAuthor(item.value.id, author.value.trim() || null)
  }
}
async function copyPath(): Promise<void> {
  if (!item.value?.abs_path) return
  try {
    await navigator.clipboard.writeText(item.value.abs_path)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <header class="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
      <button
        class="flex items-center gap-1 text-sm text-ink-dim transition-colors hover:text-ink"
        @click="router.push('/reader')"
      >
        <ArrowLeft :size="18" /> Library
      </button>
      <h1 class="ml-2 truncate text-lg font-semibold">{{ item?.title ?? 'Not found' }}</h1>
      <button
        v-if="item"
        class="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
        title="Open in a new window"
        @click="openInNewWindow"
      >
        <ExternalLink :size="16" />
      </button>
      <button
        v-if="item"
        class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors"
        :class="showDetails ? 'text-accent' : 'text-ink-dim hover:text-ink'"
        title="Book details"
        @click="showDetails = !showDetails"
      >
        <Info :size="16" /> Details
      </button>
    </header>

    <div v-if="!item" class="flex flex-1 items-center justify-center text-ink-dim">
      This book is no longer in your library.
    </div>

    <div v-else class="relative flex flex-1 overflow-hidden">
      <!-- reading surface -->
      <div class="min-w-0 flex-1 overflow-hidden">
        <EpubReader v-if="item.format === 'epub'" :key="item.id" :item="item" />
        <div v-else class="flex h-full items-center justify-center p-6 text-center">
          <div class="max-w-sm text-ink-dim">
            <BookOpen :size="34" class="mx-auto mb-3 opacity-50" />
            <p class="mb-1 text-sm font-medium text-ink">PDF reading is coming next</p>
            <p class="text-xs">
              The PDF reader (page navigation and outline-based chapters) arrives in the next
              update. EPUB reading is available now.
            </p>
          </div>
        </div>
      </div>

      <!-- details drawer -->
      <aside
        v-if="showDetails"
        class="w-72 shrink-0 space-y-4 overflow-auto border-l border-border bg-surface p-4"
        :class="isTight ? 'absolute inset-y-0 right-0 z-30 shadow-2xl' : ''"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Details</span>
          <button class="text-ink-dim hover:text-ink" @click="showDetails = false"><X :size="15" /></button>
        </div>

        <div class="group relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-surface-2">
          <img v-if="item.cover_path" :src="assetUrl(item.cover_path)" class="h-full w-full object-cover" alt="" />
          <div v-else class="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-dim">
            <BookOpen :size="28" /><span class="text-xs">No cover</span>
          </div>
          <button
            class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
            @click="store.importCover(item.id)"
          >
            <ImagePlus :size="14" /> {{ item.cover_path ? 'Replace cover' : 'Add cover' }}
          </button>
        </div>

        <div>
          <label class="mb-1 block text-xs text-ink-dim">Title</label>
          <input
            v-model="title"
            class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
            @blur="commitTitle"
            @keydown.enter="commitTitle"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-ink-dim">Author</label>
          <input
            v-model="author"
            placeholder="Unknown"
            class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
            @blur="commitAuthor"
            @keydown.enter="commitAuthor"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-ink-dim">Format</label>
          <span class="inline-block rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold uppercase">{{ item.format }}</span>
        </div>
        <div>
          <label class="mb-1 block text-xs text-ink-dim">File location</label>
          <div class="flex items-start gap-2">
            <p class="flex-1 break-all rounded-lg bg-surface-2 px-2 py-1.5 text-[11px]">{{ item.abs_path }}</p>
            <button class="shrink-0 rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink" title="Copy path" @click="copyPath">
              <component :is="copied ? Check : Copy" :size="14" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
