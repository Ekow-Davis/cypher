<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import ePub from 'epubjs'
import {
  List,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Bookmark,
  Highlighter,
  Search,
  X
} from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import { useMarksStore, HIGHLIGHT_COLORS, COLOR_HEX } from '@/stores/marks'
import MarksPanel from './MarksPanel.vue'
import type { ReaderItem } from '@shared/types'

const props = defineProps<{ item: ReaderItem }>()
const store = useReaderStore()
const marks = useMarksStore()

const viewer = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
/* epubjs ships no reliable types; keep these loosely typed. */
/* eslint-disable @typescript-eslint/no-explicit-any */
let book: any = null
let rendition: any = null

const loading = ref(true)
const errorMsg = ref<string | null>(null)
const toc = ref<any[]>([])
const showToc = ref(false)
const showSettings = ref(false)
const showMarks = ref(false)
const selection = ref<{ cfi: string; text: string } | null>(null)
const showSearch = ref(false)
const query = ref('')
const searching = ref(false)
const results = ref<{ cfi: string; excerpt: string }[]>([])
const activeHighlight = ref<{ id: number; cfi: string } | null>(null)
const currentHref = ref('')
const percent = ref(0)

// ---- display prefs (persisted globally) ----
const fontSize = ref(110)
const fontFamily = ref<'default' | 'serif' | 'sans'>('default')
const lineHeight = ref(1.6)
const theme = ref<'light' | 'sepia' | 'dark'>('light')
const flow = ref<'paginated' | 'scrolled'>('scrolled') // scrolled is the default
const widthKey = ref<'narrow' | 'medium' | 'wide' | 'full'>('medium')

const FONTS: Record<string, string> = {
  default: '',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, sans-serif'
}
const THEMES = {
  light: { color: '#1a1a1a', background: '#ffffff' },
  sepia: { color: '#5b4636', background: '#f4ecd8' },
  dark: { color: '#cfcfcf', background: '#1a1a1a' }
}
const WIDTHS: Record<string, number> = { narrow: 560, medium: 720, wide: 900, full: 0 }

const themeBg = computed(() => THEMES[theme.value].background)
const isScrolled = computed(() => flow.value === 'scrolled')
// 0 = full bleed; otherwise cap the reading column and centre it.
const stageStyle = computed(() => {
  const max = WIDTHS[widthKey.value]
  return max ? { maxWidth: `${max}px`, margin: '0 auto' } : { maxWidth: '100%' }
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let ro: ResizeObserver | null = null

async function loadPrefs(): Promise<void> {
  try {
    const raw = (await window.cypher.settings.get('readerPrefs')) as any
    if (raw && typeof raw === 'object') {
      if (raw.fontSize) fontSize.value = raw.fontSize
      if (raw.fontFamily) fontFamily.value = raw.fontFamily
      if (raw.lineHeight) lineHeight.value = raw.lineHeight
      if (raw.theme) theme.value = raw.theme
      if (raw.width) widthKey.value = raw.width
      // migrate the old 'scrolled-doc' value
      if (raw.flow === 'paginated') flow.value = 'paginated'
      else if (raw.flow) flow.value = 'scrolled'
    }
  } catch {
    /* first run */
  }
}
function savePrefs(): void {
  void window.cypher.settings.set('readerPrefs', {
    fontSize: fontSize.value,
    fontFamily: fontFamily.value,
    lineHeight: lineHeight.value,
    theme: theme.value,
    flow: flow.value,
    width: widthKey.value
  })
}

/**
 * Measures the layout container, never the element epub.js renders into.
 * In continuous scrolled mode epub.js grows that inner element as sections
 * load, so measuring it would report the height of the whole book and, worse,
 * make every scroll look like a resize.
 */
function measure(): { w: number; h: number } {
  const el = stage.value
  if (!el) return { w: 600, h: 600 }
  const max = WIDTHS[widthKey.value]
  const avail = el.clientWidth
  return {
    w: Math.max(240, Math.floor(max ? Math.min(avail, max) : avail)),
    h: Math.max(240, Math.floor(el.clientHeight))
  }
}

let lastApplied = { w: 0, h: 0 }

/**
 * Re-measures and resizes only when the box actually changed. A redundant
 * resize makes epub.js re-anchor to its current position, which is what was
 * yanking the page back while scrolling.
 */
function applyResize(): void {
  if (!rendition) return
  const { w, h } = measure()
  if (Math.abs(w - lastApplied.w) < 2 && Math.abs(h - lastApplied.h) < 2) return
  lastApplied = { w, h }
  try {
    rendition.resize(w, h)
  } catch {
    /* ignore transient resize errors */
  }
}
function scheduleResize(): void {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(applyResize, 120)
}

function applyStyles(): void {
  if (!rendition) return
  const t = THEMES[theme.value]
  const fam = FONTS[fontFamily.value]
  const textRule: Record<string, string> = { 'line-height': `${lineHeight.value} !important` }
  if (fam) textRule['font-family'] = `${fam} !important`

  rendition.themes.default({
    body: {
      color: `${t.color} !important`,
      background: `${t.background} !important`,
      padding: '0 !important',
      ...textRule
    },
    'p, li, div, span': textRule,
    img: { 'max-width': '100% !important', height: 'auto !important' },
    a: { color: 'inherit !important' }
  })
  rendition.themes.fontSize(`${fontSize.value}%`)
}

function renditionOptions(): Record<string, unknown> {
  const { w, h } = measure()
  lastApplied = { w, h }
  // 'scrolled-doc' renders one section at a time into a scrollable box. The
  // 'continuous' manager stitches the whole book together, but it re-anchors
  // when you scroll back across a boundary — which made it impossible to reach
  // the top of a chapter. One section at a time is predictable.
  return flow.value === 'paginated'
    ? { width: w, height: h, flow: 'paginated', spread: 'none' }
    : { width: w, height: h, flow: 'scrolled-doc' }
}

/** Paints stored highlights back onto the page after a render. */
function paintHighlight(id: number, cfi: string, color: string): void {
  try {
    rendition.annotations.highlight(
      cfi,
      {},
      () => {
        activeHighlight.value = { id, cfi }
      },
      'cypher-hl',
      { fill: COLOR_HEX[color], 'fill-opacity': '0.35' }
    )
  } catch {
    /* a mark from a different edition may not resolve */
  }
}

function applyStoredHighlights(): void {
  for (const m of marks.highlights) paintHighlight(m.id, m.location, m.color ?? 'amber')
}

function unpaint(cfi: string): void {
  try {
    rendition.annotations.remove(cfi, 'highlight')
  } catch {
    /* already gone */
  }
}

async function removeActiveHighlight(): Promise<void> {
  const current = activeHighlight.value
  if (!current) return
  activeHighlight.value = null
  unpaint(current.cfi)
  await marks.remove(current.id)
}

async function recolourActive(color: string): Promise<void> {
  const current = activeHighlight.value
  if (!current) return
  await marks.update(current.id, { color })
  unpaint(current.cfi)
  paintHighlight(current.id, current.cfi, color)
  activeHighlight.value = null
}

/** Panel deletions must clear the paint too, not just the list entry. */
function onMarkRemoved(mark: { kind: string; location: string }): void {
  if (mark.kind === 'highlight') unpaint(mark.location)
}

async function saveBookmark(): Promise<void> {
  try {
    const cfi = rendition.currentLocation()?.start?.cfi
    if (!cfi) return
    await marks.add({ kind: 'bookmark', location: cfi, label: currentChapterLabel.value })
  } catch (e) {
    console.warn('[reader] bookmark failed', e)
  }
}

async function saveHighlight(color: string): Promise<void> {
  if (!selection.value) return
  const { cfi, text } = selection.value
  selection.value = null
  const created = await marks.add({
    kind: 'highlight',
    location: cfi,
    label: currentChapterLabel.value,
    excerpt: text.slice(0, 400),
    color
  })
  if (created) paintHighlight(created.id, cfi, color)
}

/**
 * epub.js renders each section in its own iframe, so a selection listener has
 * to be attached to that document. The rendition-level 'selected' event alone
 * proved unreliable; this hook runs for every section as it loads.
 */
function registerSelectionHook(): void {
  try {
    rendition.hooks.content.register((contents: any) => {
      contents.document.addEventListener('mouseup', () => {
        try {
          const sel = contents.window.getSelection()
          if (!sel || sel.isCollapsed) return
          const text = String(sel).trim()
          if (!text) return
          selection.value = { cfi: contents.cfiFromRange(sel.getRangeAt(0)), text }
        } catch {
          /* selection spanning odd nodes — ignore */
        }
      })
    })
  } catch {
    /* older epub.js without content hooks */
  }
}

async function runSearch(): Promise<void> {
  const q = query.value.trim()
  if (q.length < 2 || !book) return
  searching.value = true
  results.value = []
  try {
    for (const item of book.spine.spineItems as any[]) {
      await item.load(book.load.bind(book))
      const found = (await item.find(q)) as { cfi: string; excerpt: string }[]
      item.unload()
      results.value.push(...found)
      if (results.value.length > 200) break
    }
  } catch (e) {
    console.warn('[reader] search failed', e)
  } finally {
    searching.value = false
  }
}

function bindRendition(): void {
  rendition.on('selected', (cfiRange: string, contents: any) => {
    const text = String(contents?.window?.getSelection?.() ?? '').trim()
    if (text) selection.value = { cfi: cfiRange, text }
  })
  rendition.on('relocated', (loc: any) => {
    currentHref.value = loc?.start?.href || ''
    if (loc?.start?.cfi) scheduleSaveLocation(loc.start.cfi, loc?.start?.percentage)
    if (typeof loc?.start?.percentage === 'number') {
      percent.value = Math.round(loc.start.percentage * 100)
    }
  })
  rendition.on('keyup', onKey)
}

/**
 * Guards against a display that never settles — a malformed section can leave
 * the promise pending, and the reader must not sit behind a spinner for it.
 */
async function displayOrTimeout(target: string | undefined, ms = 6000): Promise<boolean> {
  try {
    await Promise.race([
      rendition.display(target),
      new Promise((_, reject) => setTimeout(() => reject(new Error('display timeout')), ms))
    ])
    return true
  } catch (e) {
    console.warn('[reader] display did not settle:', e)
    return false
  }
}

async function loadToc(): Promise<void> {
  try {
    const nav = (await Promise.race([
      book.loaded.navigation,
      new Promise((_, reject) => setTimeout(() => reject(new Error('navigation timeout')), 8000))
    ])) as { toc?: any[] }
    if (nav?.toc?.length) {
      toc.value = nav.toc
      return
    }
  } catch (e) {
    console.warn('[reader] navigation unavailable, falling back to spine:', e)
  }
  // Fallback: list the spine so chapter jumping still works.
  try {
    const spine = (book.spine?.spineItems ?? []) as { href: string; idref?: string }[]
    toc.value = spine.map((item, i) => ({
      href: item.href,
      label: item.idref || `Section ${i + 1}`
    }))
  } catch {
    toc.value = []
  }
}

async function render(): Promise<void> {
  loading.value = true
  errorMsg.value = null
  try {
    const data = await window.cypher.reader.fileData(props.item.id)
    if (!data) {
      errorMsg.value = 'Could not read the book file.'
      return
    }
    book = ePub(data)
    await nextTick()
    rendition = book.renderTo(viewer.value as HTMLElement, renditionOptions())
    registerSelectionHook()
    applyStyles()
    await displayOrTimeout(props.item.last_location || undefined)
    applyStyles()
    // a settle pass: fonts/images can change metrics after first paint

    // Deliberately not awaited: a book whose navigation is slow or malformed
    // must not leave the reader stuck behind a spinner. Chapters arrive when
    // they arrive, and there's a spine-derived fallback if they never do.
    void loadToc()

    book.locations
      .generate(1000)
      .then(() => {
        try {
          const p = rendition.currentLocation()?.start?.percentage
          if (typeof p === 'number') percent.value = Math.round(p * 100)
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})

    bindRendition()
    await marks.loadFor(props.item.id)
    applyStoredHighlights()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

/** Rebuild the rendition (needed when flow changes), preserving position. */
async function recreate(): Promise<void> {
  if (!book || !viewer.value) return
  let cfi: string | undefined
  try {
    cfi = rendition?.currentLocation()?.start?.cfi
  } catch {
    cfi = undefined
  }
  try {
    rendition?.destroy()
  } catch {
    /* ignore */
  }
  await nextTick()
  rendition = book.renderTo(viewer.value, renditionOptions())
  registerSelectionHook()
  applyStyles()
  await displayOrTimeout(cfi || props.item.last_location || undefined)
  applyStyles()
  bindRendition()
  applyStoredHighlights()
}

function scheduleSaveLocation(cfi: string, percentage?: number): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(
    () => void store.setLocation(props.item.id, cfi, percentage),
    800
  )
}

/**
 * epub.js scrolls inside its own container, so moving between sections has to
 * reset that scroller — otherwise the next chapter opens at whatever offset you
 * had reached in the previous one.
 */
function scrollSectionTop(): void {
  const scroller = viewer.value?.querySelector('.epub-container') as HTMLElement | null
  if (scroller) scroller.scrollTop = 0
  else viewer.value?.scrollTo?.({ top: 0 })
}

async function prev(): Promise<void> {
  await rendition?.prev()
  scrollSectionTop()
}
async function next(): Promise<void> {
  await rendition?.next()
  scrollSectionTop()
}
function jumpToMark(mark: { location: string }): void {
  showMarks.value = false
  void rendition?.display(mark.location)
}


async function goTo(href: string): Promise<void> {
  showToc.value = false
  await rendition?.display(href)
  scrollSectionTop()
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowRight') void next()
  else if (e.key === 'ArrowLeft') void prev()
}

const currentChapterLabel = computed(() => {
  const href = currentHref.value.split('#')[0]
  const find = (items: any[]): string => {
    for (const it of items) {
      if ((it.href || '').split('#')[0] === href) return (it.label || '').trim()
      if (it.subitems?.length) {
        const r = find(it.subitems)
        if (r) return r
      }
    }
    return ''
  }
  return find(toc.value) || props.item.title
})

function setFontSize(delta: number): void {
  fontSize.value = Math.min(250, Math.max(60, fontSize.value + delta))
}
function setLineHeight(delta: number): void {
  lineHeight.value = Math.min(2.4, Math.max(1, Math.round((lineHeight.value + delta) * 10) / 10))
}

watch([fontSize, fontFamily, lineHeight, theme], () => {
  applyStyles()
  savePrefs()
  scheduleResize()
})
watch(widthKey, () => {
  savePrefs()
  scheduleResize() // the stage element resized; observer also fires
})
watch(flow, () => {
  savePrefs()
  void recreate()
})
// Panels overlay the page rather than shrinking it, so opening one no longer
// reflows the text mid-sentence — and needs no re-measure.

onMounted(async () => {
  await loadPrefs()
  await render()
  window.addEventListener('keydown', onKey)
  if (stage.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => scheduleResize())
    ro.observe(stage.value)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (saveTimer) clearTimeout(saveTimer)
  if (resizeTimer) clearTimeout(resizeTimer)
  ro?.disconnect()
  try {
    rendition?.destroy()
  } catch {
    /* ignore */
  }
  try {
    book?.destroy()
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- top bar -->
    <div class="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      <button
        class="rounded-lg p-1.5 transition-colors"
        :class="showToc ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
        title="Contents"
        @click="showToc = !showToc"
      >
        <List :size="16" />
      </button>
      <button
        class="rounded-lg p-1.5 transition-colors"
        :class="showSearch ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
        title="Search in book"
        @click="showSearch = !showSearch"
      >
        <Search :size="16" />
      </button>
      <button
        class="rounded-lg p-1.5 transition-colors"
        :class="showMarks ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
        title="Bookmarks & highlights"
        @click="showMarks = !showMarks"
      >
        <Highlighter :size="16" />
      </button>
      <button
        class="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        title="Bookmark this spot"
        @click="saveBookmark"
      >
        <Bookmark :size="16" />
      </button>
      <span class="min-w-0 flex-1 truncate text-sm text-ink-dim">{{ currentChapterLabel }}</span>
      <span class="shrink-0 text-xs tabular-nums text-ink-dim">{{ percent }}%</span>
      <button
        class="rounded-lg p-1.5 transition-colors"
        :class="showSettings ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
        title="Display"
        @click="showSettings = !showSettings"
      >
        <Settings2 :size="16" />
      </button>
    </div>

    <div class="relative flex min-h-0 flex-1">
      <!-- TOC -->
      <div
        v-if="showToc"
        class="absolute inset-y-0 left-0 z-30 w-64 overflow-auto border-r border-border bg-surface py-2 shadow-2xl"
      >
        <div class="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">Contents</div>
        <template v-for="(it, i) in toc" :key="i">
          <button
            class="block w-full truncate px-4 py-1.5 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
            @click="goTo(it.href)"
          >
            {{ it.label?.trim() }}
          </button>
          <button
            v-for="(sub, j) in it.subitems || []"
            :key="`${i}-${j}`"
            class="block w-full truncate py-1 pl-8 pr-4 text-left text-xs text-ink-dim hover:bg-surface-2 hover:text-ink"
            @click="goTo(sub.href)"
          >
            {{ sub.label?.trim() }}
          </button>
        </template>
      </div>

      <div
        v-if="showMarks"
        class="absolute inset-y-0 left-0 z-30 w-64 overflow-hidden border-r border-border bg-surface py-2 shadow-2xl"
      >
        <MarksPanel @jump="jumpToMark" @removed="onMarkRemoved" />
      </div>

      <div
        v-if="showSearch"
        class="absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-border bg-surface shadow-2xl"
      >
        <div class="border-b border-border p-3">
          <div class="flex items-center gap-1.5">
            <Search :size="14" class="shrink-0 text-ink-dim" />
            <input
              v-model="query"
              placeholder="Search this book…"
              class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
              @keydown.enter="runSearch"
              @keydown.esc="showSearch = false"
            />
            <button class="shrink-0 rounded p-0.5 text-ink-dim hover:text-ink" @click="showSearch = false">
              <X :size="14" />
            </button>
          </div>
          <p class="mt-1 text-[10px] text-ink-dim">
            {{ searching ? 'Searching…' : results.length ? `${results.length} result(s)` : 'Press Enter to search' }}
          </p>
        </div>
        <div class="flex-1 overflow-auto p-2">
          <button
            v-for="(r, i) in results"
            :key="i"
            class="mb-1 block w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
            @click="rendition?.display(r.cfi); showSearch = false"
          >
            {{ r.excerpt }}
          </button>
        </div>
      </div>

      <!-- reader surface -->
      <div class="relative min-w-0 flex-1 overflow-hidden" :style="{ background: themeBg }">
        <!-- page arrows: paged mode only -->
        <button
          v-if="!isScrolled"
          class="absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-center text-black/25 transition-colors hover:bg-black/5"
          title="Previous page"
          @click="prev"
        >
          <ChevronLeft :size="22" />
        </button>
        <button
          v-if="!isScrolled"
          class="absolute right-0 top-0 z-10 flex h-full w-10 items-center justify-center text-black/25 transition-colors hover:bg-black/5"
          title="Next page"
          @click="next"
        >
          <ChevronRight :size="22" />
        </button>

        <!-- sizing stage: epub.js measures THIS element -->
        <div ref="stage" class="h-full" :class="isScrolled ? 'px-6' : 'px-12'">
          <div ref="viewer" class="h-full w-full" :style="stageStyle"></div>
        </div>

        <div
          v-if="activeHighlight"
          class="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 shadow-xl"
        >
          <button
            v-for="c in HIGHLIGHT_COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border border-border transition-transform hover:scale-110"
            :style="{ background: COLOR_HEX[c] }"
            :title="`Recolour ${c}`"
            @click="recolourActive(c)"
          />
          <button
            class="rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white"
            @click="removeActiveHighlight"
          >
            Remove
          </button>
          <button class="rounded p-1 text-ink-dim hover:text-ink" @click="activeHighlight = null">
            <X :size="14" />
          </button>
        </div>

        <!-- appears when text is selected inside the book -->
        <div
          v-if="selection"
          class="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 shadow-xl"
        >
          <Highlighter :size="14" class="text-ink-dim" />
          <button
            v-for="c in HIGHLIGHT_COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border border-border transition-transform hover:scale-110"
            :style="{ background: COLOR_HEX[c] }"
            :title="`Highlight ${c}`"
            @click="saveHighlight(c)"
          />
          <button class="rounded p-1 text-ink-dim hover:text-ink" title="Cancel" @click="selection = null">
            <X :size="14" />
          </button>
        </div>

        <!-- chapter steppers: paged mode has the side arrows instead -->
        <div
          v-if="isScrolled && !loading"
          class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-3"
        >
          <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-surface/95 px-1.5 py-1 shadow-lg">
            <button
              class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="Previous chapter"
              @click="prev"
            >
              <ChevronLeft :size="14" /> Prev
            </button>
            <span class="px-1 text-[10px] text-ink-dim">chapter</span>
            <button
              class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="Next chapter"
              @click="next"
            >
              Next <ChevronRight :size="14" />
            </button>
          </div>
        </div>

        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-surface/80 text-ink-dim">
          <Loader2 :size="24" class="animate-spin" />
        </div>
        <div
          v-else-if="errorMsg"
          class="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-400"
        >
          {{ errorMsg }}
        </div>
      </div>

      <!-- settings -->
      <div
        v-if="showSettings"
        class="absolute inset-y-0 right-0 z-30 w-64 space-y-5 overflow-auto border-l border-border bg-surface p-4 shadow-2xl"
      >
        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Layout</div>
          <div class="grid grid-cols-2 gap-1">
            <button
              class="rounded-lg border px-2 py-1.5 text-xs"
              :class="isScrolled ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="flow = 'scrolled'"
            >
              Scroll
            </button>
            <button
              class="rounded-lg border px-2 py-1.5 text-xs"
              :class="!isScrolled ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="flow = 'paginated'"
            >
              Paged
            </button>
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Reading width</div>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="w in (['narrow', 'medium', 'wide', 'full'] as const)"
              :key="w"
              class="rounded-lg border px-2 py-1.5 text-xs capitalize"
              :class="widthKey === w ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="widthKey = w"
            >
              {{ w }}
            </button>
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Font size</div>
          <div class="flex items-center gap-2">
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setFontSize(-10)">
              <Minus :size="14" />
            </button>
            <span class="flex-1 text-center text-sm tabular-nums">{{ fontSize }}%</span>
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setFontSize(10)">
              <Plus :size="14" />
            </button>
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Typeface</div>
          <div class="grid grid-cols-3 gap-1">
            <button
              v-for="f in (['default', 'serif', 'sans'] as const)"
              :key="f"
              class="rounded-lg border px-2 py-1.5 text-xs capitalize"
              :class="fontFamily === f ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="fontFamily = f"
            >
              {{ f }}
            </button>
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Line spacing</div>
          <div class="flex items-center gap-2">
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setLineHeight(-0.1)">
              <Minus :size="14" />
            </button>
            <span class="flex-1 text-center text-sm tabular-nums">{{ lineHeight.toFixed(1) }}</span>
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setLineHeight(0.1)">
              <Plus :size="14" />
            </button>
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Theme</div>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="th in (['light', 'sepia', 'dark'] as const)"
              :key="th"
              class="rounded-lg border-2 py-2 text-xs capitalize"
              :class="theme === th ? 'border-accent' : 'border-border'"
              :style="{ background: THEMES[th].background, color: THEMES[th].color }"
              @click="theme = th"
            >
              {{ th }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
