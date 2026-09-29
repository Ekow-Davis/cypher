<script setup lang="ts">
/**
 * The book's in-world timeline.
 *
 * Chapters, events, lore and characters sit in their own lanes along one
 * axis; spans (a lifespan, a war) draw as bars, moments as pins. Dating
 * things here is what powers the continuity check underneath: a character
 * mentioned in a chapter set before their birth or after their death, or a
 * place mentioned before it exists, is flagged.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  BookText,
  Flag,
  ScrollText,
  Users,
  ZoomIn,
  ZoomOut,
  Maximize,
  Plus,
  AlertTriangle,
  Undo2,
  ArrowUpRight,
  Settings2,
  X
} from 'lucide-vue-next'
import { useTimelineStore } from '@/stores/timeline'
import { useChaptersStore } from '@/stores/chapters'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import { useBookUiStore } from '@/stores/bookUi'
import { mentionsIn } from '@/lib/backlinks'
import TimelineForm from './TimelineForm.vue'
import type { TimelineItem, TimelineKind } from '@shared/types'

const timeline = useTimelineStore()
const chapters = useChaptersStore()
const lore = useLoreStore()
const characters = useCharactersStore()
const ui = useBookUiStore()

type Lane = TimelineKind
const LANES: { key: Lane; label: string; icon: typeof BookText }[] = [
  { key: 'chapter', label: 'Chapters', icon: BookText },
  { key: 'event', label: 'Events', icon: Flag },
  { key: 'lore', label: 'Lore', icon: ScrollText },
  { key: 'character', label: 'Characters', icon: Users }
]

// ---------- what is on the timeline ----------

interface Placed {
  item: TimelineItem
  name: string
  sub: string
}

function nameOf(item: TimelineItem): { name: string; sub: string } | null {
  switch (item.kind) {
    case 'chapter': {
      const c = chapters.chapters.find((x) => x.id === item.ref_id)
      return c ? { name: chapters.displayTitle(c.id), sub: '' } : null
    }
    case 'lore': {
      const e = lore.entries.find((x) => x.id === item.ref_id)
      return e ? { name: e.title, sub: e.category } : null
    }
    case 'character': {
      const c = characters.characters.find((x) => x.id === item.ref_id)
      return c ? { name: c.name, sub: c.folder ?? '' } : null
    }
    default:
      return { name: item.title || 'Untitled event', sub: '' }
  }
}

/** Items whose chapter, entry or character still exists. */
const placed = computed<Placed[]>(() =>
  timeline.items
    .map((item) => {
      const n = nameOf(item)
      return n ? { item, ...n } : null
    })
    .filter((p): p is Placed => p !== null)
)

const undated = computed(() => {
  const has = timeline.byRef
  return {
    chapter: [...chapters.chapters]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((c) => !has.has(`chapter:${c.id}`))
      .map((c) => ({ id: c.id, name: chapters.displayTitle(c.id) })),
    lore: lore.entries.filter((e) => !has.has(`lore:${e.id}`)).map((e) => ({ id: e.id, name: e.title })),
    character: characters.characters
      .filter((c) => !has.has(`character:${c.id}`))
      .map((c) => ({ id: c.id, name: c.name }))
  }
})

// ---------- scale ----------

const viewport = ref<HTMLElement | null>(null)
const viewportWidth = ref(800)
const zoom = ref(1)
const PAD = 48

const domain = computed(() => {
  const values: number[] = []
  for (const p of placed.value) {
    values.push(p.item.start_at)
    if (p.item.end_at != null) values.push(p.item.end_at)
  }
  if (!values.length) return { min: 0, max: 10 }
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.04
  return { min: min - pad, max: max + pad }
})

const pxPerUnit = computed(() => {
  const span = domain.value.max - domain.value.min
  return ((viewportWidth.value - PAD * 2) / span) * zoom.value
})
const contentWidth = computed(
  () => (domain.value.max - domain.value.min) * pxPerUnit.value + PAD * 2
)
function x(value: number): number {
  return (value - domain.value.min) * pxPerUnit.value + PAD
}
function valueAt(px: number): number {
  return (px - PAD) / pxPerUnit.value + domain.value.min
}

/** Round-number gridlines roughly every 110px. */
const ticks = computed(() => {
  const raw = 110 / pxPerUnit.value
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const out: number[] = []
  const first = Math.ceil(domain.value.min / step) * step
  for (let v = first; v <= domain.value.max && out.length < 400; v += step) {
    out.push(Math.round(v * 1e6) / 1e6)
  }
  return out
})

// ---------- lane layout ----------

const ROW = 30

interface Box {
  p: Placed
  left: number
  width: number
  row: number
  span: boolean
}

/** Greedy row packing so labels never overlap within a lane. */
const lanes = computed(() =>
  LANES.map((lane) => {
    const items = placed.value
      .filter((p) => p.item.kind === lane.key)
      .sort((a, b) => a.item.start_at - b.item.start_at)
    const rowEnds: number[] = []
    const boxes: Box[] = items.map((p) => {
      const left = x(p.item.start_at)
      const span = p.item.end_at != null && p.item.end_at > p.item.start_at
      const barWidth = span ? Math.max(8, x(p.item.end_at!) - left) : 0
      const labelWidth = Math.min(240, p.name.length * 7 + 26)
      const width = Math.max(barWidth, labelWidth)
      let row = rowEnds.findIndex((end) => end + 8 < left)
      if (row === -1) {
        row = rowEnds.length
        rowEnds.push(0)
      }
      rowEnds[row] = left + width
      return { p, left, width: barWidth, row, span }
    })
    return { ...lane, boxes, rows: Math.max(1, rowEnds.length) }
  })
)

// ---------- zoom & pan ----------

function setZoom(next: number, anchorPx?: number): void {
  const el = viewport.value
  const clamped = Math.min(400, Math.max(0.5, next))
  if (!el) {
    zoom.value = clamped
    return
  }
  const anchor = anchorPx ?? el.clientWidth / 2
  const valueUnder = valueAt(el.scrollLeft + anchor)
  zoom.value = clamped
  void nextTick(() => {
    el.scrollLeft = x(valueUnder) - anchor
  })
}

function onWheel(e: WheelEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  const rect = viewport.value!.getBoundingClientRect()
  setZoom(zoom.value * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX - rect.left)
}

function fit(): void {
  zoom.value = 1
  void nextTick(() => viewport.value && (viewport.value.scrollLeft = 0))
}

/** The value in the middle of what's on screen — where new things go. */
function centreValue(): number {
  const el = viewport.value
  if (!el) return Math.round((domain.value.min + domain.value.max) / 2)
  return Math.round(valueAt(el.scrollLeft + el.clientWidth / 2))
}

let ro: ResizeObserver | null = null
onMounted(() => {
  if (viewport.value) {
    viewportWidth.value = viewport.value.clientWidth
    ro = new ResizeObserver(() => {
      if (viewport.value) viewportWidth.value = viewport.value.clientWidth
    })
    ro.observe(viewport.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())

// ---------- editing ----------

const editing = ref<{ kind: TimelineKind; refId: number | null; item: TimelineItem | null; name: string } | null>(null)
const showScale = ref(false)
const scaleUnit = ref(timeline.scale.unit)
const scaleSuffix = ref(timeline.scale.suffix)

function edit(p: Placed): void {
  editing.value = { kind: p.item.kind, refId: p.item.ref_id, item: p.item, name: p.name }
}
function dateIt(kind: Exclude<TimelineKind, 'event'>, id: number, name: string): void {
  editing.value = { kind, refId: id, item: null, name }
}
function newEvent(): void {
  editing.value = { kind: 'event', refId: null, item: null, name: 'New event' }
}
function openSource(item: TimelineItem): void {
  if (item.ref_id == null) return
  if (item.kind === 'chapter') {
    chapters.setActive(item.ref_id)
    ui.setTab('manuscript')
  } else if (item.kind === 'lore') ui.openLore(item.ref_id)
  else if (item.kind === 'character') ui.openCharacter(item.ref_id)
}
async function saveScale(): Promise<void> {
  await timeline.setScale(scaleUnit.value, scaleSuffix.value)
  showScale.value = false
}

// ---------- continuity ----------

interface Warning {
  chapterId: number
  chapter: string
  who: string
  kind: 'character' | 'lore'
  refId: number
  text: string
}

/**
 * Everything a dated chapter mentions (plus its POV character) that has
 * dates of its own, checked against when the chapter happens.
 */
const warnings = computed<Warning[]>(() => {
  const out: Warning[] = []
  for (const ch of chapters.chapters) {
    const when = timeline.byRef.get(`chapter:${ch.id}`)
    if (!when) continue
    const from = when.start_at
    const to = when.end_at ?? when.start_at
    const refs = new Map<string, { kind: 'character' | 'lore'; id: number }>()
    for (const m of mentionsIn(`chapter:${ch.id}`, ch.content)) refs.set(`${m.kind}:${m.id}`, m)
    if (ch.pov_character_id != null)
      refs.set(`character:${ch.pov_character_id}`, { kind: 'character', id: ch.pov_character_id })

    for (const ref of refs.values()) {
      const span = timeline.byRef.get(`${ref.kind}:${ref.id}`)
      if (!span) continue
      const name =
        ref.kind === 'character'
          ? characters.characters.find((c) => c.id === ref.id)?.name
          : lore.entries.find((e) => e.id === ref.id)?.title
      if (!name) continue
      const base = { chapterId: ch.id, chapter: chapters.displayTitle(ch.id), who: name, kind: ref.kind, refId: ref.id }
      if (to < span.start_at) {
        out.push({
          ...base,
          text:
            ref.kind === 'character'
              ? `appears before being born (${timeline.formatTime(span.start_at)})`
              : `is mentioned before it begins (${timeline.formatTime(span.start_at)})`
        })
      } else if (span.end_at != null && from > span.end_at) {
        out.push({
          ...base,
          text:
            ref.kind === 'character'
              ? `appears after dying (${timeline.formatTime(span.end_at)}) — a flashback or memory?`
              : `is mentioned after it ends (${timeline.formatTime(span.end_at)})`
        })
      }
    }
  }
  return out
})

/** Chapters told out of chronological order — informational, not an error. */
const flashbacks = computed(() => {
  const set = new Set<number>()
  let latest = -Infinity
  for (const ch of [...chapters.chapters].sort((a, b) => a.sort_order - b.sort_order)) {
    const when = timeline.byRef.get(`chapter:${ch.id}`)
    if (!when) continue
    if (when.start_at < latest) set.add(ch.id)
    latest = Math.max(latest, when.start_at)
  }
  return set
})

const selectedId = computed(() => editing.value?.item?.id ?? null)
</script>

<template>
  <div class="flex h-full flex-1 overflow-hidden">
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- toolbar -->
      <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Timeline</span>
        <span class="text-xs text-ink-dim">{{ placed.length }} dated</span>
        <span class="flex-1" />
        <button class="rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink" title="Zoom out" @click="setZoom(zoom / 1.5)">
          <ZoomOut :size="15" />
        </button>
        <button class="rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink" title="Zoom in (or Ctrl + scroll)" @click="setZoom(zoom * 1.5)">
          <ZoomIn :size="15" />
        </button>
        <button class="rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink" title="Fit everything" @click="fit">
          <Maximize :size="15" />
        </button>
        <div class="relative">
          <button
            class="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs text-ink-dim hover:text-ink"
            title="How this book counts time"
            @click="showScale = !showScale"
          >
            <Settings2 :size="14" /> {{ timeline.scale.unit }}{{ timeline.scale.suffix ? ` · ${timeline.scale.suffix}` : '' }}
          </button>
          <div v-if="showScale" class="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-border bg-surface p-3 shadow-xl">
            <p class="mb-2 text-xs text-ink-dim">
              Any calendar works — dates are plain numbers on this scale, so decimals can stand for
              months or days.
            </p>
            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="mb-0.5 block text-[11px] text-ink-dim">Unit</span>
                <input v-model="scaleUnit" placeholder="Year" class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line" />
              </label>
              <label class="block">
                <span class="mb-0.5 block text-[11px] text-ink-dim">Era suffix</span>
                <input v-model="scaleSuffix" placeholder="AE" class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line" />
              </label>
            </div>
            <div class="mt-3 flex justify-end">
              <button class="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-on-accent" @click="saveScale">Save</button>
            </div>
          </div>
        </div>
        <button class="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent" @click="newEvent">
          <Plus :size="14" /> Event
        </button>
      </div>

      <!-- the timeline -->
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <!-- lane labels -->
        <div class="w-28 shrink-0 border-r border-border bg-surface/60 pt-8">
          <div
            v-for="lane in lanes"
            :key="lane.key"
            class="flex items-start gap-1.5 border-b border-border px-3 pt-2 text-xs font-medium text-ink-dim"
            :style="{ height: lane.rows * ROW + 16 + 'px' }"
          >
            <component :is="lane.icon" :size="13" class="mt-0.5 shrink-0" /> {{ lane.label }}
          </div>
        </div>

        <div ref="viewport" class="relative min-w-0 flex-1 overflow-x-auto overflow-y-auto" @wheel="onWheel">
          <div class="relative" :style="{ width: contentWidth + 'px', minHeight: '100%' }">
            <!-- axis -->
            <div class="sticky top-0 z-10 h-8 border-b border-border bg-surface/90 backdrop-blur">
              <div
                v-for="t in ticks"
                :key="t"
                class="absolute top-0 h-8 border-l border-border pl-1 pt-2 text-[10px] tabular-nums text-ink-dim"
                :style="{ left: x(t) + 'px' }"
              >
                {{ timeline.formatTime(t) }}
              </div>
            </div>
            <!-- gridlines -->
            <div
              v-for="t in ticks"
              :key="`g${t}`"
              class="pointer-events-none absolute bottom-0 top-8 border-l border-border/50"
              :style="{ left: x(t) + 'px' }"
            />

            <!-- lanes -->
            <div
              v-for="lane in lanes"
              :key="lane.key"
              class="relative border-b border-border"
              :style="{ height: lane.rows * ROW + 16 + 'px' }"
            >
              <button
                v-for="b in lane.boxes"
                :key="b.p.item.id"
                class="group absolute flex items-center gap-1.5 text-left"
                :style="{ left: b.left + 'px', top: 8 + b.row * ROW + 'px', height: ROW - 6 + 'px' }"
                :title="`${b.p.name}\n${timeline.describe(b.p.item)}${b.p.item.note ? '\n' + b.p.item.note : ''}`"
                @click="edit(b.p)"
              >
                <span
                  v-if="b.span"
                  class="absolute bottom-0 left-0 h-1.5 rounded-full transition-colors"
                  :class="selectedId === b.p.item.id ? 'bg-accent' : 'bg-accent/45 group-hover:bg-accent/70'"
                  :style="{ width: b.width + 'px' }"
                />
                <span
                  v-else
                  class="relative -ml-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-surface"
                  :class="selectedId === b.p.item.id ? 'bg-accent ring-2 ring-accent-line' : 'bg-accent'"
                />
                <span
                  class="relative whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs transition-colors"
                  :class="[
                    b.span ? '-mt-1.5' : '',
                    selectedId === b.p.item.id ? 'bg-accent-soft text-ink' : 'bg-surface/80 text-ink-dim group-hover:text-ink'
                  ]"
                >
                  {{ b.p.name }}
                  <span v-if="b.p.item.kind === 'chapter' && flashbacks.has(b.p.item.ref_id!)" class="ml-1 inline-flex items-center gap-0.5 text-[10px] text-sky-400" title="Told out of chronological order">
                    <Undo2 :size="10" /> flashback
                  </span>
                </span>
              </button>
            </div>

            <div v-if="!placed.length" class="absolute inset-x-0 top-24 text-center text-sm text-ink-dim">
              Nothing dated yet. Pick something from the list on the right, or add an event.
            </div>
          </div>
        </div>
      </div>

      <!-- continuity -->
      <div v-if="warnings.length" class="max-h-44 overflow-auto border-t border-border bg-amber-500/5 px-4 py-2">
        <div class="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
          <AlertTriangle :size="13" /> Continuity ({{ warnings.length }})
        </div>
        <ul class="space-y-0.5">
          <li v-for="(w, i) in warnings" :key="i" class="text-xs text-ink-dim">
            <button class="font-medium text-ink hover:underline" @click="ui.openChapterAtMention(w.chapterId, w.kind, w.refId)">
              {{ w.chapter }}
            </button>
            — <span class="text-ink">{{ w.who }}</span> {{ w.text }}
          </li>
        </ul>
      </div>
    </div>

    <!-- side panel: editor or undated list -->
    <aside class="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface/60">
      <template v-if="editing">
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ editing.name }}</span>
          <button
            v-if="editing.item && editing.item.ref_id != null"
            class="shrink-0 rounded p-1 text-ink-dim hover:text-accent"
            title="Open"
            @click="openSource(editing.item)"
          >
            <ArrowUpRight :size="14" />
          </button>
          <button class="shrink-0 rounded p-1 text-ink-dim hover:text-ink" title="Close" @click="editing = null">
            <X :size="14" />
          </button>
        </div>
        <div class="p-4">
          <TimelineForm
            :key="`${editing.kind}-${editing.refId}-${editing.item?.id ?? 'new'}`"
            :kind="editing.kind"
            :ref-id="editing.refId"
            :item="editing.item"
            :suggested-start="centreValue()"
            @done="editing = null"
            @cancel="editing = null"
          />
        </div>
      </template>

      <template v-else>
        <div class="border-b border-border px-4 py-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Not on the timeline</span>
        </div>
        <div class="space-y-4 p-3">
          <div v-for="group in ([
            { kind: 'chapter', label: 'Chapters', list: undated.chapter },
            { kind: 'lore', label: 'Lore', list: undated.lore },
            { kind: 'character', label: 'Characters', list: undated.character }
          ] as const)" :key="group.kind">
            <div class="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
              {{ group.label }} · {{ group.list.length }}
            </div>
            <p v-if="!group.list.length" class="px-1 text-xs text-ink-dim">All dated.</p>
            <button
              v-for="u in group.list.slice(0, 60)"
              :key="u.id"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
              @click="dateIt(group.kind, u.id, u.name)"
            >
              <span class="min-w-0 flex-1 truncate">{{ u.name }}</span>
              <Plus :size="12" class="shrink-0 opacity-60" />
            </button>
            <p v-if="group.list.length > 60" class="px-2 text-[11px] text-ink-dim">
              +{{ group.list.length - 60 }} more
            </p>
          </div>
        </div>
      </template>
    </aside>
  </div>
</template>
