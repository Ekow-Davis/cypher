<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Settings2,
  PanelRight,
  BookText,
  Library,
  Users,
  Maximize2,
  Minimize2,
  Download,
  ExternalLink,
  PanelLeft
} from 'lucide-vue-next'
import { useBooksStore } from '@/stores/books'
import { useChaptersStore } from '@/stores/chapters'
import { useInsightsStore } from '@/stores/insights'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import { useBookUiStore } from '@/stores/bookUi'
import { useNotesStore } from '@/stores/notes'
import { useAppStore } from '@/stores/app'
import ChapterList from './ChapterList.vue'
import ChapterEditor from './ChapterEditor.vue'
import InsightsSidebar from './InsightsSidebar.vue'
import LoreView from './LoreView.vue'
import CharacterView from './CharacterView.vue'
import ExportDialog from './ExportDialog.vue'
import OverflowMenu from '@/components/OverflowMenu.vue'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { Book } from '@shared/types'

const route = useRoute()
const router = useRouter()
const booksStore = useBooksStore()
const chapters = useChaptersStore()
const insights = useInsightsStore()
const lore = useLoreStore()
const characters = useCharactersStore()
const ui = useBookUiStore()
const notes = useNotesStore()
const app = useAppStore()
const { isNarrow, isTight } = useBreakpoint()

const book = ref<Book | null>(null)
const showInsights = ref(true)
const showLoreSidebar = ref(true)
const showExport = ref(false)
const windowNotice = ref<string | null>(null)
const showChapters = ref(true)

// Two inline panels don't fit a half-screen window, so the right-hand one
// steps aside as soon as things get narrow.
watch(isNarrow, (narrow) => {
  if (narrow) {
    showInsights.value = false
    showLoreSidebar.value = false
  }
})

/** Opens the tab you're on in its own window — same book or another. */
async function openInNewWindow(): Promise<void> {
  const res = await window.cypher.windows.open(`/book/${route.params.id}?tab=${ui.tab}`)
  if (!res.ok) {
    windowNotice.value = res.reason ?? 'Could not open another window.'
    setTimeout(() => (windowNotice.value = null), 4000)
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && app.focusMode) app.setFocus(false)
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  app.setFocus(false)
})

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  // A window opened via "new window" boots straight into the right tab.
  const requested = String(route.query.tab ?? '')
  ui.setTab(
    requested === 'lore' || requested === 'characters' || requested === 'manuscript'
      ? requested
      : 'manuscript'
  )
  const id = Number(route.params.id)
  book.value = await booksStore.get(id)
  await Promise.all([
    chapters.loadForBook(id),
    insights.loadForBook(id),
    lore.loadForBook(id),
    characters.loadForBook(id),
    notes.loadForBook(id)
  ])
})
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      v-if="!app.focusMode"
      class="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 sm:px-5 sm:py-3"
    >
      <button
        class="flex shrink-0 items-center gap-1 text-sm text-ink-dim transition-colors hover:text-ink"
        title="Back to shelf"
        @click="router.push('/book')"
      >
        <ArrowLeft :size="18" />
        <span v-if="!isTight">Shelf</span>
      </button>

      <h1 v-if="!isTight" class="min-w-0 truncate text-lg font-semibold">
        {{ book?.title ?? 'Loading…' }}
      </h1>

      <!-- tabs: labels drop away when space is short -->
      <nav class="ml-1 flex shrink-0 items-center gap-1 rounded-lg bg-surface-2 p-1">
        <button
          v-for="t in ([
            { key: 'manuscript', label: 'Manuscript', icon: BookText },
            { key: 'lore', label: 'Lore', icon: Library },
            { key: 'characters', label: 'Characters', icon: Users }
          ] as const)"
          :key="t.key"
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors sm:px-3"
          :class="ui.tab === t.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          :title="t.label"
          @click="ui.setTab(t.key)"
        >
          <component :is="t.icon" :size="15" />
          <span v-if="!isNarrow">{{ t.label }}</span>
        </button>
      </nav>

      <div class="ml-auto flex shrink-0 items-center gap-1.5">
        <!-- list toggle, useful once panels start overlaying -->
        <button
          v-if="ui.tab === 'manuscript'"
          class="rounded-lg border border-border p-1.5 transition-colors"
          :class="showChapters ? 'text-accent' : 'text-ink-dim hover:text-ink'"
          title="Toggle chapter list"
          @click="showChapters = !showChapters"
        >
          <PanelLeft :size="16" />
        </button>

        <button
          v-if="ui.tab === 'manuscript'"
          class="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-sm transition-colors sm:px-3"
          :class="showInsights ? 'text-accent' : 'text-ink-dim hover:text-ink'"
          title="Toggle Goals & Insights"
          @click="showInsights = !showInsights"
        >
          <PanelRight :size="16" />
          <span v-if="!isNarrow">Insights</span>
        </button>
        <button
          v-else-if="ui.tab === 'lore'"
          class="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-sm transition-colors sm:px-3"
          :class="showLoreSidebar ? 'text-accent' : 'text-ink-dim hover:text-ink'"
          title="Toggle Codex details"
          @click="showLoreSidebar = !showLoreSidebar"
        >
          <PanelRight :size="16" />
          <span v-if="!isNarrow">Details</span>
        </button>

        <!-- everything else lives here, per tab -->
        <OverflowMenu>
          <button
            v-if="ui.tab === 'manuscript'"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
            @click="app.setFocus(true)"
          >
            <Maximize2 :size="15" /> Focus mode
          </button>
          <button
            v-if="ui.tab === 'manuscript'"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
            @click="showExport = true"
          >
            <Download :size="15" /> Export book…
          </button>
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
            @click="openInNewWindow"
          >
            <ExternalLink :size="15" /> Open tab in new window
          </button>
          <div class="my-1 border-t border-border" />
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
            @click="router.push(`/book/${route.params.id}/settings`)"
          >
            <Settings2 :size="15" /> Book settings
          </button>
        </OverflowMenu>
      </div>
    </header>

    <!-- MANUSCRIPT -->
    <div v-if="ui.tab === 'manuscript'" class="relative flex flex-1 overflow-hidden">
      <ChapterList
        v-if="!app.focusMode && showChapters"
        :class="isTight ? 'absolute inset-y-0 left-0 z-30 shadow-2xl' : ''"
      />
      <main class="min-w-0 flex-1 overflow-hidden">
        <ChapterEditor v-if="chapters.active" :chapter="chapters.active" />
        <div v-else class="flex h-full items-center justify-center text-ink-dim">
          No chapter selected.
        </div>
      </main>
      <InsightsSidebar
        v-if="showInsights && !app.focusMode"
        :class="isTight ? 'absolute inset-y-0 right-0 z-30 shadow-2xl' : ''"
      />
    </div>

    <!-- LORE -->
    <LoreView v-else-if="ui.tab === 'lore'" :show-sidebar="showLoreSidebar" />

    <!-- CHARACTERS -->
    <CharacterView v-else-if="ui.tab === 'characters'" />

    <div
      v-if="windowNotice"
      class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-xs shadow-lg"
    >
      {{ windowNotice }}
    </div>

    <ExportDialog v-if="showExport" :book-id="Number(route.params.id)" @close="showExport = false" />

    <!-- focus-mode exit -->
    <button
      v-if="app.focusMode"
      class="fixed bottom-5 right-5 z-40 flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 py-2 text-xs text-ink-dim opacity-30 shadow-lg transition-opacity hover:opacity-100"
      title="Exit focus mode (Esc)"
      @click="app.setFocus(false)"
    >
      <Minimize2 :size="14" /> Exit focus
    </button>
  </div>
</template>
