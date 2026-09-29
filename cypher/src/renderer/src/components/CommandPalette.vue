<script setup lang="ts">
/**
 * Ctrl+K: jump anywhere or do anything by typing its name.
 *
 * Everywhere: the app's areas, every book and document, settings and stats.
 * Inside a book: its chapters, lore entries and characters, its tabs, and the
 * actions that make sense there (new chapter, scene break, focus mode…).
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, type Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Search,
  BookText,
  FileText,
  Lock,
  BookOpen,
  Settings,
  ChartLine,
  Library,
  Users,
  CalendarRange,
  ScrollText,
  Plus,
  Maximize2,
  SunMoon,
  ZoomIn,
  ZoomOut,
  Asterisk,
  User,
  Hash
} from 'lucide-vue-next'
import { useBooksStore } from '@/stores/books'
import { useDocumentsStore } from '@/stores/documents'
import { useChaptersStore } from '@/stores/chapters'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import { useBookUiStore } from '@/stores/bookUi'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'
import { usePreferencesStore } from '@/stores/preferences'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: Component
  keywords?: string
  run: () => void | Promise<void>
}

const router = useRouter()
const route = useRoute()
const books = useBooksStore()
const documents = useDocumentsStore()
const chapters = useChaptersStore()
const lore = useLoreStore()
const characters = useCharactersStore()
const ui = useBookUiStore()
const app = useAppStore()
const theme = useThemeStore()
const prefs = usePreferencesStore()

const open = ref(false)
const query = ref('')
const selected = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

const inBook = computed(() => route.name === 'book-workspace')
const bookId = computed(() => (inBook.value ? Number(route.params.id) : null))

/** The chapter editor on screen, if any — for editor actions. */
function chapterEditor(): any {
  const pm = document.querySelector('.ProseMirror') as (HTMLElement & { editor?: any }) | null
  const ed = pm?.editor
  return ed?.schema?.nodes?.sceneBreak ? ed : null
}

const commands = computed<Command[]>(() => {
  const out: Command[] = []
  const go = (path: string) => () => void router.push(path)

  if (inBook.value) {
    const tab = (t: 'manuscript' | 'lore' | 'characters' | 'timeline') => () => ui.setTab(t)
    out.push(
      { id: 'a:chapter', group: 'Actions', label: 'New chapter', icon: Plus, run: async () => { await chapters.add(null); ui.setTab('manuscript') } },
      { id: 'a:lore', group: 'Actions', label: 'New lore entry', icon: Plus, run: async () => { await lore.add('General'); ui.setTab('lore') } },
      { id: 'a:char', group: 'Actions', label: 'New character', icon: Plus, run: async () => { await characters.add(null); ui.setTab('characters') } },
      { id: 'a:focus', group: 'Actions', label: 'Focus mode', icon: Maximize2, keywords: 'distraction free', run: () => { ui.setTab('manuscript'); app.setFocus(true) } }
    )
    if (ui.tab === 'manuscript' && chapters.active) {
      out.push({
        id: 'a:scene',
        group: 'Actions',
        label: 'Insert scene break',
        hint: prefs.sceneBreakGlyph,
        icon: Asterisk,
        keywords: 'divider separator section',
        run: () => chapterEditor()?.chain().focus().insertSceneBreak(prefs.sceneBreakGlyph).run()
      })
    }
    out.push(
      { id: 't:m', group: 'This book', label: 'Manuscript', icon: BookText, run: tab('manuscript') },
      { id: 't:l', group: 'This book', label: 'Lore', icon: Library, keywords: 'codex', run: tab('lore') },
      { id: 't:c', group: 'This book', label: 'Characters', icon: Users, keywords: 'cast', run: tab('characters') },
      { id: 't:t', group: 'This book', label: 'Timeline', icon: CalendarRange, keywords: 'chronology dates', run: tab('timeline') },
      { id: 't:s', group: 'This book', label: 'Book settings', icon: Settings, run: go(`/book/${bookId.value}/settings`) }
    )
    for (const c of [...chapters.chapters].sort((a, b) => a.sort_order - b.sort_order)) {
      out.push({
        id: `c:${c.id}`,
        group: 'Chapters',
        label: chapters.displayTitle(c.id),
        hint: `${c.word_count.toLocaleString()} words`,
        icon: Hash,
        run: () => { chapters.setActive(c.id); ui.setTab('manuscript') }
      })
    }
    for (const e of lore.entries) {
      out.push({ id: `l:${e.id}`, group: 'Lore', label: e.title, hint: e.category, icon: ScrollText, run: () => ui.openLore(e.id) })
    }
    for (const c of characters.characters) {
      out.push({ id: `p:${c.id}`, group: 'Characters', label: c.name, hint: c.folder ?? '', icon: User, run: () => ui.openCharacter(c.id) })
    }
  }

  out.push(
    { id: 'g:books', group: 'Go to', label: 'Bookshelf', icon: BookText, keywords: 'books home', run: go('/book') },
    { id: 'g:docs', group: 'Go to', label: 'Documents', icon: FileText, run: go('/document') },
    { id: 'g:diary', group: 'Go to', label: 'Diary', icon: Lock, keywords: 'journal', run: go('/diary') },
    { id: 'g:reader', group: 'Go to', label: 'Reader', icon: BookOpen, keywords: 'library epub pdf', run: go('/reader') },
    { id: 'g:settings', group: 'Go to', label: 'Settings', icon: Settings, keywords: 'preferences', run: go('/settings') },
    { id: 'g:stats', group: 'Go to', label: 'Writing stats', icon: ChartLine, keywords: 'statistics analytics words charts', run: go('/stats') }
  )
  for (const b of books.books) {
    if (b.id === bookId.value) continue
    out.push({ id: `b:${b.id}`, group: 'Books', label: b.title, icon: BookText, run: go(`/book/${b.id}`) })
  }
  for (const d of documents.docs) {
    out.push({ id: `d:${d.id}`, group: 'Documents', label: d.title || 'Untitled', icon: FileText, run: go(`/document/${d.id}`) })
  }
  out.push(
    { id: 'v:mode', group: 'View', label: 'Switch light / dark', icon: SunMoon, keywords: 'theme mode', run: () => theme.toggleMode() },
    { id: 'v:bigger', group: 'View', label: 'Bigger interface', hint: 'Ctrl +', icon: ZoomIn, keywords: 'zoom text size', run: () => prefs.stepUiScale(1) },
    { id: 'v:smaller', group: 'View', label: 'Smaller interface', hint: 'Ctrl −', icon: ZoomOut, keywords: 'zoom text size', run: () => prefs.stepUiScale(-1) }
  )
  return out
})

/**
 * Prefix beats word-start beats substring beats scattered letters; shorter
 * labels win ties. Empty query keeps the natural order (actions first).
 */
function score(c: Command, q: string): number {
  if (!q) return 1
  const label = c.label.toLowerCase()
  const hay = `${label} ${c.keywords ?? ''} ${c.group.toLowerCase()}`
  if (label.startsWith(q)) return 1000 - label.length
  const wordStart = label.split(/[\s\-—:]+/).some((w) => w.startsWith(q))
  if (wordStart) return 800 - label.length
  if (label.includes(q)) return 600 - label.length
  if (hay.includes(q)) return 400
  let i = 0
  for (const ch of label) if (ch === q[i]) i++
  return i === q.length ? 200 - label.length : 0
}

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const scored = commands.value
    .map((c, order) => ({ c, s: score(c, q), order }))
    .filter((x) => x.s > 0)
  if (q) scored.sort((a, b) => b.s - a.s || a.order - b.order)
  // Without a query, long lists (chapters…) are trimmed so the rest stays visible.
  const perGroup = new Map<string, number>()
  return scored
    .filter((x) => {
      if (q) return true
      const n = (perGroup.get(x.c.group) ?? 0) + 1
      perGroup.set(x.c.group, n)
      return n <= 6
    })
    .slice(0, 60)
    .map((x) => x.c)
})

watch(query, () => (selected.value = 0))

function show(): void {
  open.value = true
  query.value = ''
  selected.value = 0
  if (!books.books.length) void books.load()
  void documents.load()
  void nextTick(() => input.value?.focus())
}

function close(): void {
  open.value = false
}

async function run(c: Command | undefined): Promise<void> {
  if (!c) return
  close()
  await c.run()
}

function onKey(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK') {
    e.preventDefault()
    e.stopPropagation()
    if (open.value) close()
    else show()
  }
}

function onInputKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selected.value = Math.min(results.value.length - 1, selected.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selected.value = Math.max(0, selected.value - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    void run(results.value[selected.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

watch(selected, async () => {
  await nextTick()
  list.value?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

defineExpose({ show })
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[85] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
    @mousedown.self="close"
  >
    <div class="flex max-h-[65vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
      <div class="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search :size="16" class="text-ink-dim" />
        <input
          ref="input"
          v-model="query"
          class="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-dim"
          :placeholder="inBook ? 'Jump to a chapter, entry, character — or type a command…' : 'Go anywhere or run a command…'"
          @keydown="onInputKey"
        />
        <kbd class="rounded border border-border px-1.5 text-[10px] text-ink-dim">Esc</kbd>
      </div>
      <div ref="list" class="flex-1 overflow-auto py-1.5">
        <p v-if="!results.length" class="px-4 py-6 text-center text-sm text-ink-dim">Nothing matches “{{ query }}”.</p>
        <template v-for="(c, i) in results" :key="c.id">
          <div
            v-if="i === 0 || results[i - 1].group !== c.group"
            class="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim"
          >
            {{ c.group }}
          </div>
          <button
            :data-selected="i === selected"
            class="mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm"
            :class="i === selected ? 'bg-accent-soft text-ink' : 'text-ink-dim'"
            @mousemove="selected = i"
            @click="run(c)"
          >
            <component :is="c.icon" :size="15" class="shrink-0" :class="i === selected ? 'text-accent' : ''" />
            <span class="min-w-0 flex-1 truncate">{{ c.label }}</span>
            <span v-if="c.hint" class="max-w-[10rem] shrink-0 truncate text-[11px] text-ink-dim">{{ c.hint }}</span>
          </button>
        </template>
      </div>
      <div class="flex gap-3 border-t border-border px-4 py-1.5 text-[10px] text-ink-dim">
        <span>↑↓ to move</span><span>Enter to open</span><span>Ctrl K to toggle</span>
      </div>
    </div>
  </div>
</template>
