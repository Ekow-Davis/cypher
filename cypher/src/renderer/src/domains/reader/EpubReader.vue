<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import ePub from 'epubjs'
import { List, Settings2, ChevronLeft, ChevronRight, Loader2, Minus, Plus } from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import type { ReaderItem } from '@shared/types'

const props = defineProps<{ item: ReaderItem }>()
const store = useReaderStore()

const viewer = ref<HTMLElement | null>(null)
// epubjs ships no reliable types; keep these loosely typed.
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

// display prefs (persisted globally)
const fontSize = ref(110)
const fontFamily = ref<'default' | 'serif' | 'sans'>('default')
const lineHeight = ref(1.5)
const theme = ref<'light' | 'sepia' | 'dark'>('light')
const flow = ref<'paginated' | 'scrolled-doc'>('paginated')

const FONTS: Record<string, string> = {
  default: 'initial',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, sans-serif'
}
const THEMES = {
  light: { color: '#1a1a1a', background: '#ffffff' },
  sepia: { color: '#5b4636', background: '#f4ecd8' },
  dark: { color: '#cfcfcf', background: '#1a1a1a' }
}
const themeBg = computed(() => THEMES[theme.value].background)

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function loadPrefs(): Promise<void> {
  try {
    const raw = (await window.cypher.settings.get('readerPrefs')) as any
    if (raw && typeof raw === 'object') {
      if (raw.fontSize) fontSize.value = raw.fontSize
      if (raw.fontFamily) fontFamily.value = raw.fontFamily
      if (raw.lineHeight) lineHeight.value = raw.lineHeight
      if (raw.theme) theme.value = raw.theme
      if (raw.flow) flow.value = raw.flow
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
    flow: flow.value
  })
}

function applyStyles(): void {
  if (!rendition) return
  const t = THEMES[theme.value]
  rendition.themes.override('color', t.color)
  rendition.themes.override('background', t.background)
  rendition.themes.override('line-height', String(lineHeight.value))
  rendition.themes.override('font-family', FONTS[fontFamily.value])
  rendition.themes.fontSize(`${fontSize.value}%`)
}

function bindRendition(): void {
  rendition.on('relocated', (loc: any) => {
    currentHref.value = loc?.start?.href || ''
    if (loc?.start?.cfi) scheduleSaveLocation(loc.start.cfi)
    if (typeof loc?.start?.percentage === 'number') percent.value = Math.round(loc.start.percentage * 100)
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
    rendition = book.renderTo(viewer.value as HTMLElement, {
      width: '100%',
      height: '100%',
      flow: flow.value,
      spread: 'none'
    })
    applyStyles()
    await rendition.display(props.item.last_location || undefined)
    applyStyles()

    const nav = await book.loaded.navigation
    toc.value = nav.toc || []

    // percentage needs generated locations (async, non-blocking)
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

async function recreate(): Promise<void> {
  if (!book) return
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
  rendition = book.renderTo(viewer.value as HTMLElement, {
    width: '100%',
    height: '100%',
    flow: flow.value,
    spread: 'none'
  })
  applyStyles()
  await rendition.display(cfi || props.item.last_location || undefined)
  applyStyles()
  bindRendition()
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
})
watch(flow, () => {
  savePrefs()
  void recreate()
})

function onResize(): void {
  try {
    rendition?.resize()
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await loadPrefs()
  await render()
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  if (saveTimer) clearTimeout(saveTimer)
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
  <div class="flex h-full flex-col" :style="{ background: themeBg }">
    <!-- top bar -->
    <div class="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      <button class="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink" title="Contents" @click="showToc = !showToc">
        <List :size="16" />
      </button>
      <span class="min-w-0 flex-1 truncate text-sm text-ink-dim">{{ currentChapterLabel }}</span>
      <span class="shrink-0 text-xs tabular-nums text-ink-dim">{{ percent }}%</span>
      <button class="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink" title="Display" @click="showSettings = !showSettings">
        <Settings2 :size="16" />
      </button>
    </div>

    <div class="relative flex flex-1 overflow-hidden">
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
      <div class="relative flex-1">
        <button
          class="absolute left-0 top-0 z-10 flex h-full w-12 items-center justify-center text-ink-dim/40 transition-colors hover:bg-black/5 hover:text-ink-dim"
          title="Previous"
          @click="prev"
        >
          <ChevronLeft :size="24" />
        </button>
        <div ref="viewer" class="h-full w-full px-12"></div>
        <button
          class="absolute right-0 top-0 z-10 flex h-full w-12 items-center justify-center text-ink-dim/40 transition-colors hover:bg-black/5 hover:text-ink-dim"
          title="Next"
          @click="next"
        >
          <ChevronRight :size="24" />
        </button>

        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-surface/80 text-ink-dim">
          <Loader2 :size="24" class="animate-spin" />
        </div>
        <div v-else-if="errorMsg" class="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-400">
          {{ errorMsg }}
        </div>
      </div>

      <!-- settings -->
      <div v-if="showSettings" class="w-64 shrink-0 space-y-5 overflow-auto border-l border-border bg-surface p-4">
        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Font size</div>
          <div class="flex items-center gap-2">
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setFontSize(-10)"><Minus :size="14" /></button>
            <span class="flex-1 text-center text-sm tabular-nums">{{ fontSize }}%</span>
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setFontSize(10)"><Plus :size="14" /></button>
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
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setLineHeight(-0.1)"><Minus :size="14" /></button>
            <span class="flex-1 text-center text-sm tabular-nums">{{ lineHeight.toFixed(1) }}</span>
            <button class="rounded-lg border border-border p-1.5 hover:bg-surface-2" @click="setLineHeight(0.1)"><Plus :size="14" /></button>
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

        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">Layout</div>
          <div class="grid grid-cols-2 gap-1">
            <button
              class="rounded-lg border px-2 py-1.5 text-xs"
              :class="flow === 'paginated' ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="flow = 'paginated'"
            >
              Paged
            </button>
            <button
              class="rounded-lg border px-2 py-1.5 text-xs"
              :class="flow === 'scrolled-doc' ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="flow = 'scrolled-doc'"
            >
              Scrolled
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
