<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  List,
  Bookmark,
  Highlighter,
  Search,
  X,
  Loader2,
  Minus,
  Plus,
  ChevronUp,
  ChevronDown,
  Maximize,
  Moon
} from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import { useMarksStore, HIGHLIGHT_COLORS, COLOR_HEX } from '@/stores/marks'
import MarksPanel from './MarksPanel.vue'
import type { ReaderItem } from '@shared/types'

/* pdf.js ships no bundled types here; keep the document loosely typed. */
/* eslint-disable @typescript-eslint/no-explicit-any */

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ item: ReaderItem }>()
const store = useReaderStore()
const marks = useMarksStore()

const container = ref<HTMLElement | null>(null)
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const showOutline = ref(false)
const showMarks = ref(false)
const showSearch = ref(false)
const query = ref('')
const searching = ref(false)
const results = ref<{ page: number; excerpt: string }[]>([])
const selection = ref<{ page: number; text: string; rects: number[][] } | null>(null)
const activeHighlight = ref<number | null>(null)
const night = ref(false)

let pdf: any = null
let observer: IntersectionObserver | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

interface PageBox {
  num: number
  w: number
  h: number
}
const pages = ref<PageBox[]>([])
const outline = ref<any[]>([])
const currentPage = ref(1)
const pageCount = ref(0)
const jumpTo = ref<number | string>(1)

const scale = ref(1.2)
const fitWidth = ref(true)
const rendered = new Set<number>()
const renderQueue: number[] = []
let renderingNow = false

/** Base (scale-1) dimensions, kept so zoom can recompute without re-asking pdf.js. */
const baseSizes = new Map<number, { w: number; h: number }>()

function pageEl(num: number): HTMLElement | null {
  return container.value?.querySelector(`[data-page="${num}"]`) ?? null
}

function computeScale(): number {
  if (!fitWidth.value) return scale.value
  const first = baseSizes.get(1)
  const avail = (container.value?.clientWidth ?? 800) - 48
  if (!first || avail <= 0) return scale.value
  return Math.max(0.3, Math.min(4, avail / first.w))
}

function layoutPages(): void {
  const s = computeScale()
  pages.value = pages.value.map((p) => {
    const base = baseSizes.get(p.num)
    return base ? { num: p.num, w: Math.floor(base.w * s), h: Math.floor(base.h * s) } : p
  })
}

async function renderPage(num: number): Promise<void> {
  if (!pdf || rendered.has(num)) return
  const host = pageEl(num)
  const canvas = host?.querySelector('canvas') as HTMLCanvasElement | null
  if (!host || !canvas) return
  rendered.add(num)
  try {
    const page = await pdf.getPage(num)
    const s = computeScale()
    const viewport = page.getViewport({ scale: s })
    // Render at device resolution so text stays crisp on high-DPI screens.
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    await page.render({ canvasContext: ctx, viewport }).promise

    // A transparent text layer over the canvas makes the page selectable and
    // copyable — the whole point of reading beside the editor.
    const layer = host.querySelector('.pdf-text-layer') as HTMLElement | null
    if (layer) {
      layer.replaceChildren()
      layer.style.setProperty('--scale-factor', String(s))
      try {
        const textContent = await page.getTextContent()
        const TextLayerCtor = (pdfjsLib as any).TextLayer
        if (TextLayerCtor) {
          await new TextLayerCtor({ textContentSource: textContent, container: layer, viewport })
            .render()
        }
      } catch (e) {
        console.warn('[pdf] text layer unavailable', e)
      }
    }
  } catch (e) {
    rendered.delete(num)
    console.warn('[pdf] page render failed', num, e)
  }
}

/**
 * Renders one page at a time. Scrolling quickly can put a dozen pages on screen
 * at once, and firing that many rasterisations in parallel is what makes the
 * scroll stutter. Anything that drifts far out of view before its turn comes is
 * dropped rather than drawn.
 */
function enqueueRender(num: number): void {
  if (rendered.has(num) || renderQueue.includes(num)) return
  renderQueue.push(num)
  void drainQueue()
}

async function drainQueue(): Promise<void> {
  if (renderingNow) return
  renderingNow = true
  try {
    while (renderQueue.length) {
      const num = renderQueue.shift() as number
      const host = pageEl(num)
      if (host && container.value) {
        const box = host.getBoundingClientRect()
        const view = container.value.getBoundingClientRect()
        if (box.bottom < view.top - 1500 || box.top > view.bottom + 1500) continue
      }
      await renderPage(num)
    }
  } finally {
    renderingNow = false
  }
}

function observePages(): void {
  observer?.disconnect()
  if (!container.value) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const num = Number((entry.target as HTMLElement).dataset.page)
        if (!num) continue
        if (entry.isIntersecting) {
          enqueueRender(num)
          if (entry.intersectionRatio > 0.5) {
            currentPage.value = num
            jumpTo.value = num
            scheduleSave(num)
          }
        }
      }
    },
    { root: container.value, rootMargin: '300px 0px', threshold: [0, 0.5] }
  )
  container.value.querySelectorAll('[data-page]').forEach((el) => observer?.observe(el))
}

function scheduleSave(page: number): void {
  if (saveTimer) clearTimeout(saveTimer)
  const progress = pageCount.value ? page / pageCount.value : 0
  saveTimer = setTimeout(
    () => void store.setLocation(props.item.id, String(page), progress),
    800
  )
}

function scrollToPage(num: number): void {
  const el = pageEl(num)
  if (el && container.value) {
    container.value.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
  }
}

/**
 * Turns a text-layer selection into page-relative rectangles. Fractions of the
 * page (not pixels) so a highlight survives zooming and re-rendering.
 */
function captureSelection(): void {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  const text = sel.toString().trim()
  if (!text) return
  try {
    const range = sel.getRangeAt(0)
    const start =
      range.startContainer.nodeType === 1
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement
    const host = start?.closest('[data-page]') as HTMLElement | null
    if (!host) return
    const box = host.getBoundingClientRect()
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => [
        (r.left - box.left) / box.width,
        (r.top - box.top) / box.height,
        r.width / box.width,
        r.height / box.height
      ])
    if (!rects.length) return
    selection.value = { page: Number(host.dataset.page), text, rects }
  } catch {
    /* ignore odd selections */
  }
}

/**
 * Overlays are click-through so selecting text still works; instead we hit-test
 * the click against stored rectangles to find which highlight was tapped.
 */
function onPageClick(e: MouseEvent): void {
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) return
  const host = (e.target as HTMLElement)?.closest?.('[data-page]') as HTMLElement | null
  if (!host) {
    activeHighlight.value = null
    return
  }
  const page = Number(host.dataset.page)
  const box = host.getBoundingClientRect()
  const x = (e.clientX - box.left) / box.width
  const y = (e.clientY - box.top) / box.height
  for (const m of marks.highlights) {
    if (Number(m.location) !== page || !m.rects) continue
    try {
      const rects = JSON.parse(m.rects) as number[][]
      if (rects.some((r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3])) {
        activeHighlight.value = m.id
        return
      }
    } catch {
      /* skip malformed geometry */
    }
  }
  activeHighlight.value = null
}

async function removeActiveHighlight(): Promise<void> {
  const id = activeHighlight.value
  if (id == null) return
  activeHighlight.value = null
  await marks.remove(id)
}

async function recolourActive(color: string): Promise<void> {
  const id = activeHighlight.value
  if (id == null) return
  await marks.update(id, { color })
  activeHighlight.value = null
}

async function saveHighlight(color: string): Promise<void> {
  if (!selection.value) return
  const { page, text, rects } = selection.value
  selection.value = null
  window.getSelection()?.removeAllRanges()
  await marks.add({
    kind: 'highlight',
    location: String(page),
    label: `Page ${page}`,
    excerpt: text.slice(0, 400),
    color,
    rects: JSON.stringify(rects)
  })
}

/** Stored highlight rectangles for a given page. */
function highlightsFor(page: number): { rects: number[][]; color: string }[] {
  return marks.highlights
    .filter((m) => Number(m.location) === page && m.rects)
    .map((m) => {
      try {
        return { rects: JSON.parse(m.rects as string) as number[][], color: m.color ?? 'amber' }
      } catch {
        return { rects: [], color: 'amber' }
      }
    })
}

async function runSearch(): Promise<void> {
  const q = query.value.trim().toLowerCase()
  if (q.length < 2 || !pdf) return
  searching.value = true
  results.value = []
  try {
    for (let n = 1; n <= pageCount.value; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const text = content.items.map((i: any) => i.str ?? '').join(' ')
      const lower = text.toLowerCase()
      let idx = lower.indexOf(q)
      while (idx !== -1) {
        results.value.push({
          page: n,
          excerpt: text.slice(Math.max(0, idx - 50), idx + q.length + 50).replace(/\s+/g, ' ').trim()
        })
        if (results.value.length >= 200) break
        idx = lower.indexOf(q, idx + q.length)
      }
      if (results.value.length >= 200) break
    }
  } catch (e) {
    console.warn('[pdf] search failed', e)
  } finally {
    searching.value = false
  }
}

async function saveBookmark(): Promise<void> {
  await marks.add({
    kind: 'bookmark',
    location: String(currentPage.value),
    label: `Page ${currentPage.value}`
  })
}

function jumpToMark(mark: { location: string }): void {
  showMarks.value = false
  const n = Number(mark.location)
  if (n >= 1 && n <= pageCount.value) scrollToPage(n)
}

async function goToOutline(item: any): Promise<void> {
  showOutline.value = false
  try {
    let dest = item.dest
    if (typeof dest === 'string') dest = await pdf.getDestination(dest)
    if (!Array.isArray(dest)) return
    const index = await pdf.getPageIndex(dest[0])
    scrollToPage(index + 1)
  } catch (e) {
    console.warn('[pdf] outline jump failed', e)
  }
}

async function load(): Promise<void> {
  loading.value = true
  errorMsg.value = null
  try {
    const buf = await window.cypher.reader.fileData(props.item.id)
    if (!buf) {
      errorMsg.value = 'Could not read the PDF file.'
      return
    }
    // pdf.js takes ownership of the buffer it's given, so hand it a copy.
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
    pageCount.value = pdf.numPages

    const boxes: PageBox[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      baseSizes.set(n, { w: vp.width, h: vp.height })
      boxes.push({ num: n, w: vp.width, h: vp.height })
    }
    pages.value = boxes
    layoutPages()

    try {
      outline.value = (await pdf.getOutline()) ?? []
    } catch {
      outline.value = []
    }

    await marks.loadFor(props.item.id)
    await nextTick()
    observePages()

    const saved = Number(props.item.last_location)
    if (saved >= 1 && saved <= pdf.numPages) {
      await nextTick()
      scrollToPage(saved)
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function requeueRender(): void {
  renderQueue.length = 0
  rendered.clear()
  layoutPages()
  void nextTick(() => {
    observePages()
    enqueueRender(currentPage.value)
  })
}

function zoom(delta: number): void {
  fitWidth.value = false
  scale.value = Math.max(0.3, Math.min(4, Math.round((scale.value + delta) * 10) / 10))
  requeueRender()
}
function toggleFit(): void {
  fitWidth.value = !fitWidth.value
  requeueRender()
}
function step(delta: number): void {
  const next = Math.max(1, Math.min(pageCount.value, currentPage.value + delta))
  scrollToPage(next)
}
function commitJump(): void {
  const n = Number(jumpTo.value)
  if (n >= 1 && n <= pageCount.value) scrollToPage(n)
  else jumpTo.value = currentPage.value
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onResize(): void {
  if (!fitWidth.value) return
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(requeueRender, 200)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowRight' || e.key === 'PageDown') step(1)
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') step(-1)
}

const zoomLabel = computed(() =>
  fitWidth.value ? 'Fit' : `${Math.round(computeScale() * 100)}%`
)

onMounted(async () => {
  await load()
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKey)
  container.value?.addEventListener('mouseup', captureSelection)
  container.value?.addEventListener('click', onPageClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKey)
  container.value?.removeEventListener('mouseup', captureSelection)
  container.value?.removeEventListener('click', onPageClick)
  if (saveTimer) clearTimeout(saveTimer)
  if (resizeTimer) clearTimeout(resizeTimer)
  observer?.disconnect()
  try {
    pdf?.destroy?.()
  } catch {
    /* ignore */
  }
})

watch(() => props.item.id, () => {
  rendered.clear()
  baseSizes.clear()
  pages.value = []
  void load()
})
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- toolbar -->
    <div class="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <button
        class="rounded-lg p-1.5 transition-colors"
        :class="showOutline ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
        title="Contents"
        @click="showOutline = !showOutline"
      >
        <List :size="16" />
      </button>

      <button
        class="rounded-lg p-1.5 transition-colors"
        :class="showSearch ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
        title="Search in document"
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
        title="Bookmark this page"
        @click="saveBookmark"
      >
        <Bookmark :size="16" />
      </button>

      <div class="flex items-center gap-1 text-xs text-ink-dim">
        <button class="rounded p-1 hover:bg-surface-2 hover:text-ink" title="Previous page" @click="step(-1)">
          <ChevronUp :size="14" />
        </button>
        <input
          v-model="jumpTo"
          class="w-10 rounded border border-border bg-surface-2 px-1 py-0.5 text-center text-xs outline-none focus:border-accent-line"
          @keydown.enter="commitJump"
          @blur="commitJump"
        />
        <span class="tabular-nums">/ {{ pageCount }}</span>
        <button class="rounded p-1 hover:bg-surface-2 hover:text-ink" title="Next page" @click="step(1)">
          <ChevronDown :size="14" />
        </button>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <button class="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink" title="Zoom out" @click="zoom(-0.1)">
          <Minus :size="15" />
        </button>
        <span class="w-10 text-center text-xs tabular-nums text-ink-dim">{{ zoomLabel }}</span>
        <button class="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink" title="Zoom in" @click="zoom(0.1)">
          <Plus :size="15" />
        </button>
        <button
          class="rounded-lg p-1.5 transition-colors"
          :class="fitWidth ? 'text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
          title="Fit to width"
          @click="toggleFit"
        >
          <Maximize :size="15" />
        </button>
        <button
          class="rounded-lg p-1.5 transition-colors"
          :class="night ? 'text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
          title="Night mode"
          @click="night = !night"
        >
          <Moon :size="15" />
        </button>
      </div>
    </div>

    <div class="relative min-h-0 flex-1">
      <!-- outline overlays the page so nothing reflows -->
      <div
        v-if="showOutline"
        class="absolute inset-y-0 left-0 z-30 w-64 overflow-auto border-r border-border bg-surface py-2 shadow-2xl"
      >
        <div class="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">Contents</div>
        <template v-if="outline.length">
          <template v-for="(it, i) in outline" :key="i">
            <button
              class="block w-full truncate px-4 py-1.5 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
              @click="goToOutline(it)"
            >
              {{ it.title }}
            </button>
            <button
              v-for="(sub, j) in it.items || []"
              :key="`${i}-${j}`"
              class="block w-full truncate py-1 pl-8 pr-4 text-left text-xs text-ink-dim hover:bg-surface-2 hover:text-ink"
              @click="goToOutline(sub)"
            >
              {{ sub.title }}
            </button>
          </template>
        </template>
        <p v-else class="px-4 py-2 text-xs text-ink-dim">This PDF has no outline.</p>
      </div>

      <div
        v-if="showMarks"
        class="absolute inset-y-0 left-0 z-30 w-64 overflow-hidden border-r border-border bg-surface py-2 shadow-2xl"
      >
        <MarksPanel @jump="jumpToMark" />
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
              placeholder="Search this document…"
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
            @click="scrollToPage(r.page); showSearch = false"
          >
            <span class="block text-[10px] font-semibold text-accent">Page {{ r.page }}</span>
            {{ r.excerpt }}
          </button>
        </div>
      </div>

      <!-- pages -->
      <div ref="container" class="h-full overflow-auto bg-surface-2/40">
        <div
          class="flex flex-col items-center gap-4 py-4"
          :style="{ filter: night ? 'invert(1) hue-rotate(180deg)' : 'none' }"
        >
          <div
            v-for="p in pages"
            :key="p.num"
            :data-page="p.num"
            class="relative bg-white shadow-lg"
            :style="{ width: p.w + 'px', height: p.h + 'px' }"
          >
            <canvas class="block h-full w-full" />
            <template v-for="(h, hi) in highlightsFor(p.num)" :key="hi">
              <div
                v-for="(r, ri) in h.rects"
                :key="ri"
                class="pointer-events-none absolute rounded-sm"
                :style="{
                  left: r[0] * 100 + '%',
                  top: r[1] * 100 + '%',
                  width: r[2] * 100 + '%',
                  height: r[3] * 100 + '%',
                  background: COLOR_HEX[h.color],
                  opacity: 0.32
                }"
              />
            </template>
            <div class="pdf-text-layer" />
          </div>
        </div>
      </div>

      <div
        v-if="activeHighlight != null"
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
  </div>
</template>
