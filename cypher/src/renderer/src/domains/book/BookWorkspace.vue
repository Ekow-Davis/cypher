<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Settings2 } from 'lucide-vue-next'
import { useBooksStore } from '@/stores/books'
import { useChaptersStore } from '@/stores/chapters'
import ChapterList from './ChapterList.vue'
import ChapterEditor from './ChapterEditor.vue'
import type { Book } from '@shared/types'

const route = useRoute()
const router = useRouter()
const booksStore = useBooksStore()
const chapters = useChaptersStore()

const book = ref<Book | null>(null)

onMounted(async () => {
  const id = Number(route.params.id)
  book.value = await booksStore.get(id)
  await chapters.loadForBook(id)
})
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
      <button
        class="flex items-center gap-1 text-sm text-ink-dim transition-colors hover:text-ink"
        @click="router.push('/book')"
      >
        <ArrowLeft :size="18" /> Shelf
      </button>
      <h1 class="ml-2 truncate text-lg font-semibold">{{ book?.title ?? 'Loading…' }}</h1>
      <button
        class="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
        @click="router.push(`/book/${route.params.id}/settings`)"
      >
        <Settings2 :size="16" /> Settings
      </button>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <ChapterList />
      <main class="flex-1 overflow-hidden">
        <ChapterEditor v-if="chapters.active" :chapter="chapters.active" />
        <div v-else class="flex h-full items-center justify-center text-ink-dim">
          No chapter selected.
        </div>
      </main>
    </div>
  </div>
</template>
