<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import ePub from 'epubjs'
import { List, Settings2, ChevronLeft, ChevronRight, Loader2, Minus, Plus } from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import type { ReaderItem } from '@shared/types'

const props = defineProps<{ item: ReaderItem }>()
const store = useReaderStore()

const viewer = ref<HTMLElement | null>(null)
/* epubjs ships no reliable types; keep these loosely typed. */
/* eslint-disable @typescript-eslint/no-explicit-any */
let book: any = null
let rendition: any = null

const loading = ref(true)
const errorMsg = ref<string | null>(null)
const toc = ref<any[]>([])
const showToc = ref(false)
const showSettings = ref(false)
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

/** Measure the element epub.js renders into. */
function measure(): { w: number; h: number } {
  const el = viewer.value
  if (!el) return { w: 600, h: 600 }
  return {
    w: Math.max(240, Math.floor(el.clientWidth)),
    h: Math.max(240, Math.floor(el.clientHeight))
  }
}

/** Re-measure and tell epub.js its new size. This is what keeps the iframe
 *  in step with panels opening/closing and window resizes. */
function applyResize(): void {
  if (!rendition) return
  const { w, h } = measure()
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
  return flow.value === 'paginated'
    ? { width: w, height: h, flow: 'paginated', spread: 'none' }
    : { width: w, height: h, flow: 'scrolled', manager: 'continuous' }
}

function bindRendition(): void {
  rendition.on('relocated', (loc: any) => {
    currentHref.value = loc?.start?.href || ''
    if (loc?.start?.cfi) scheduleSaveLocation(loc.start.cfi)
    if (typeof loc?.start?.percentage === 'number') {
      percent.value = Math.round(loc.start.percentage * 100)
    }
  })
  rendition.on('keyup', onKey)
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
    applyStyles()
    await rendition.display(props.item.last_location || undefined)
    applyStyles()
    // a settle pass: fonts/images can change metrics after first paint
    scheduleResize()

    const nav = await book.loaded.navigation
    toc.value = nav.toc || []

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
  applyStyles()
  await rendition.display(cfi || props.item.last_location || undefined)
  applyStyles()
  bindRendition()
  scheduleResize()
}

function scheduleSaveLocation(cfi: string): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void store.setLocation(props.item.id, cfi), 800)
}

function prev(): void {
  rendition?.prev()
}
function next(): void {
  rendition?.next()
}
function goTo(href: string): void {
  rendition?.display(href)
  showToc.value = false
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
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
// panels change the available width -> re-measure
watch([showToc, showSettings], () => scheduleResize())

onMounted(async () => {
  await loadPrefs()
  await render()
  window.addEventListener('keydown', onKey)
  if (viewer.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => scheduleResize())
    ro.observe(viewer.value)
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

    <div class="flex min-h-0 flex-1">
      <!-- TOC -->
      <div v-if="showToc" class="w-64 shrink-0 overflow-auto border-r border-border bg-surface py-2">
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
        <div class="h-full" :class="isScrolled ? 'px-6' : 'px-12'">
          <div ref="viewer" class="h-full w-full" :style="stageStyle"></div>
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
        class="w-64 shrink-0 space-y-5 overflow-auto border-l border-border bg-surface p-4"
      >
        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Layout</div>
          <div class="grid grid-cols-2 gap-1">
            <button
              class="rounded-lg border px-2 py-1.5 text-xs"
              :class="isScrolled ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="flow = 'scrolled'"
            >
              Scrolled
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
