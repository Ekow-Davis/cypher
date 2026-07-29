<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, ImagePlus, Trash2, AlertCircle, X, BookOpen } from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import { assetUrl } from '@/lib/assets'
import type { ReaderImportResult } from '@shared/types'

const store = useReaderStore()
const router = useRouter()

const pendingDelete = ref<ReaderImportResult | null>(null)

onMounted(() => {
  if (!store.loaded) void store.load()
})

async function addBook(): Promise<void> {
  const res = await store.importFile()
  if (res) pendingDelete.value = res
}

async function confirmDeleteSource(): Promise<void> {
  if (pendingDelete.value) await store.deleteSource(pendingDelete.value.sourcePath)
  pendingDelete.value = null
}

function open(id: number): void {
  void router.push(`/reader/${id}`)
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <header class="flex items-center gap-3 border-b border-border bg-surface px-6 py-4">
      <h1 class="text-xl font-bold">Reader</h1>
      <button
        class="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
        @click="addBook"
      >
        <Plus :size="16" /> Add book
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

    <div class="flex-1 overflow-auto p-6">
      <div v-if="!store.items.length" class="flex h-full flex-col items-center justify-center text-ink-dim">
        <BookOpen :size="40" class="mb-3 opacity-50" />
        <p class="text-sm">Your library is empty.</p>
        <p class="text-xs">Add an EPUB or PDF to start reading.</p>
      </div>

      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
        <div v-for="item in store.items" :key="item.id" class="group flex flex-col">
          <!-- cover -->
          <div
            class="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl border border-border bg-surface-2"
            @click="open(item.id)"
          >
            <img
              v-if="item.cover_path"
              :src="assetUrl(item.cover_path)"
              class="h-full w-full object-cover"
              alt=""
            />
            <div v-else class="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
              <BookOpen :size="26" class="text-ink-dim" />
              <span class="line-clamp-3 text-xs text-ink-dim">{{ item.title }}</span>
            </div>
            <span
              class="absolute right-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white"
            >
              {{ item.format }}
            </span>
            <!-- hover actions -->
            <div class="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/55 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button class="rounded p-1 text-white hover:text-accent" title="Set cover" @click.stop="store.importCover(item.id)">
                <ImagePlus :size="15" />
              </button>
              <button class="rounded p-1 text-white hover:text-red-400" title="Remove from library" @click.stop="store.remove(item.id)">
                <Trash2 :size="15" />
              </button>
            </div>
          </div>
          <!-- meta -->
          <button class="mt-2 truncate text-left text-sm font-medium hover:text-accent" @click="open(item.id)">
            {{ item.title }}
          </button>
          <span class="truncate text-xs text-ink-dim">{{ item.author || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- delete-source prompt -->
    <div
      v-if="pendingDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="pendingDelete = null"
    >
      <div class="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-2 text-lg font-bold">Delete the original file?</h2>
        <p class="mb-3 text-sm text-ink-dim">
          A copy was added to your library at:
        </p>
        <p class="mb-3 break-all rounded-lg bg-surface-2 px-3 py-2 text-xs">
          {{ pendingDelete.item.abs_path }}
        </p>
        <p class="mb-2 text-sm text-ink-dim">
          To avoid duplicates, delete the original at:
        </p>
        <p class="mb-5 break-all rounded-lg bg-surface-2 px-3 py-2 text-xs">
          {{ pendingDelete.sourcePath }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink"
            @click="pendingDelete = null"
          >
            Keep both
          </button>
          <button
            class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            @click="confirmDeleteSource"
          >
            Delete original
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
