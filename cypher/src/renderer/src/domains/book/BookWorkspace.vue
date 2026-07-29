<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Settings2, PanelRight, BookText, Library, Users } from 'lucide-vue-next'
import { useBooksStore } from '@/stores/books'
import { useChaptersStore } from '@/stores/chapters'
import { useInsightsStore } from '@/stores/insights'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import ChapterList from './ChapterList.vue'
import ChapterEditor from './ChapterEditor.vue'
import InsightsSidebar from './InsightsSidebar.vue'
import LoreView from './LoreView.vue'
import CharacterView from './CharacterView.vue'
import type { Book } from '@shared/types'

const route = useRoute()
const router = useRouter()
const booksStore = useBooksStore()
const chapters = useChaptersStore()
const insights = useInsightsStore()
const lore = useLoreStore()
const characters = useCharactersStore()

const book = ref<Book | null>(null)
const showInsights = ref(true)
const showLoreSidebar = ref(true)
type Tab = 'manuscript' | 'lore' | 'characters'
const tab = ref<Tab>('manuscript')

onMounted(async () => {
  const id = Number(route.params.id)
  book.value = await booksStore.get(id)
  await Promise.all([
    chapters.loadForBook(id),
    insights.loadForBook(id),
    lore.loadForBook(id),
    characters.loadForBook(id)
  ])
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

      <!-- tabs -->
      <nav class="ml-4 flex items-center gap-1 rounded-lg bg-surface-2 p-1">
        <button
          class="flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors"
          :class="tab === 'manuscript' ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          @click="tab = 'manuscript'"
        >
          <BookText :size="15" /> Manuscript
        </button>
        <button
          class="flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors"
          :class="tab === 'lore' ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          @click="tab = 'lore'"
        >
          <Library :size="15" /> Lore
        </button>
        <button
          class="flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors"
          :class="tab === 'characters' ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          @click="tab = 'characters'"
        >
          <Users :size="15" /> Characters
        </button>
      </nav>

      <!-- right-sidebar toggle (per tab) -->
      <button
        v-if="tab === 'manuscript'"
        class="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors"
        :class="showInsights ? 'text-accent' : 'text-ink-dim hover:text-ink'"
        title="Toggle Goals & Insights"
        @click="showInsights = !showInsights"
      >
        <PanelRight :size="16" /> Insights
      </button>
      <button
        v-else-if="tab === 'lore'"
        class="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors"
        :class="showLoreSidebar ? 'text-accent' : 'text-ink-dim hover:text-ink'"
        title="Toggle Codex details"
        @click="showLoreSidebar = !showLoreSidebar"
      >
        <PanelRight :size="16" /> Details
      </button>

      <button
        class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
        :class="tab === 'characters' ? 'ml-auto' : ''"
        @click="router.push(`/book/${route.params.id}/settings`)"
      >
        <Settings2 :size="16" /> Settings
      </button>
    </header>

    <!-- MANUSCRIPT -->
    <div v-if="tab === 'manuscript'" class="flex flex-1 overflow-hidden">
      <ChapterList />
      <main class="flex-1 overflow-hidden">
        <ChapterEditor v-if="chapters.active" :chapter="chapters.active" />
        <div v-else class="flex h-full items-center justify-center text-ink-dim">
          No chapter selected.
        </div>
      </main>
      <InsightsSidebar v-if="showInsights" />
    </div>

    <!-- LORE -->
    <LoreView v-else-if="tab === 'lore'" :show-sidebar="showLoreSidebar" />

    <!-- CHARACTERS -->
    <CharacterView v-else-if="tab === 'characters'" />
  </div>
</template>
