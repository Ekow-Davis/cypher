<script setup lang="ts">
import { ref, computed } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as Caret } from 'lucide-vue-next'
import { useInsightsStore } from '@/stores/insights'
import type { Checkin } from '@shared/types'

const insights = useInsightsStore()
const open = ref(true)

const MOODS: Record<string, string> = {
  great: '🤩',
  good: '🙂',
  okay: '😐',
  low: '😕',
  rough: '😞'
}
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const today = new Date()
const cursor = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selected = ref<string | null>(null)

const byDate = computed(() => {
  const m = new Map<string, Checkin>()
  for (const c of insights.checkins) m.set(c.date, c)
  return m
})

interface Cell {
  date: string | null
  day: number
  words: number
  deleted: number
  mood: string | null
  isToday: boolean
  isFuture: boolean
}

const cells = computed<Cell[]>(() => {
  const year = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = first.getDay()
  const todayStr = ymd(today)

  const out: Cell[] = []
  for (let i = 0; i < lead; i++) {
    out.push({ date: null, day: 0, words: 0, deleted: 0, mood: null, isToday: false, isFuture: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = ymd(new Date(year, month, d))
    const c = byDate.value.get(ds)
    out.push({
      date: ds,
      day: d,
      words: c?.words_written ?? 0,
      deleted: c?.words_deleted ?? 0,
      mood: c?.mood ?? null,
      isToday: ds === todayStr,
      isFuture: ds > todayStr
    })
  }
  return out
})

const monthMax = computed(() => Math.max(1, ...cells.value.map((c) => c.words)))

/** Four intensity steps so a light day still reads as "wrote something". */
function level(words: number): number {
  if (words <= 0) return 0
  const ratio = words / monthMax.value
  if (ratio > 0.66) return 4
  if (ratio > 0.33) return 3
  if (ratio > 0.1) return 2
  return 1
}
function cellStyle(c: Cell): Record<string, string> {
  const l = level(c.words)
  if (l === 0) return { background: 'var(--color-surface-2)' }
  const pct = [0, 22, 40, 62, 85][l]
  return { background: `color-mix(in oklab, var(--color-accent) ${pct}%, var(--color-surface-2))` }
}

const monthLabel = computed(() =>
  cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
)
const atCurrentMonth = computed(
  () =>
    cursor.value.getFullYear() === today.getFullYear() &&
    cursor.value.getMonth() === today.getMonth()
)

function shiftMonth(delta: number): void {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
  selected.value = null
}

const monthStats = computed(() => {
  const days = cells.value.filter((c) => c.date && c.words > 0)
  const written = days.reduce((n, c) => n + c.words, 0)
  const deleted = cells.value.reduce((n, c) => n + c.deleted, 0)
  const best = days.reduce((m, c) => Math.max(m, c.words), 0)
  return { written, deleted, activeDays: days.length, best }
})

const selectedCell = computed(() => cells.value.find((c) => c.date === selected.value) ?? null)
const selectedNote = computed(() =>
  selected.value ? (byDate.value.get(selected.value)?.note ?? null) : null
)

function fmtDay(ds: string): string {
  return new Date(ds + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}
</script>

<template>
  <section class="rounded-xl border border-border bg-surface">
    <button class="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold" @click="open = !open">
      <CalendarDays :size="15" class="text-accent" />
      Writing calendar
      <component :is="open ? ChevronDown : Caret" :size="14" class="ml-auto text-ink-dim" />
    </button>

    <div v-if="open" class="px-3 pb-3">
      <!-- month nav -->
      <div class="mb-2 flex items-center gap-1">
        <button class="rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink" title="Previous month" @click="shiftMonth(-1)">
          <ChevronLeft :size="14" />
        </button>
        <span class="flex-1 text-center text-xs font-medium">{{ monthLabel }}</span>
        <button
          class="rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink disabled:opacity-30"
          title="Next month"
          :disabled="atCurrentMonth"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="14" />
        </button>
      </div>

      <!-- weekday header -->
      <div class="mb-1 grid grid-cols-7 gap-1">
        <span v-for="(w, i) in WEEKDAYS" :key="i" class="text-center text-[9px] text-ink-dim">{{ w }}</span>
      </div>

      <!-- grid -->
      <div class="grid grid-cols-7 gap-1">
        <template v-for="(c, i) in cells" :key="i">
          <span v-if="!c.date" class="aspect-square" />
          <button
            v-else
            class="relative aspect-square rounded text-[9px] transition-all"
            :class="[
              c.isToday ? 'ring-1 ring-accent' : '',
              selected === c.date ? 'ring-2 ring-accent' : '',
              c.isFuture ? 'opacity-30' : '',
              c.words > 0 ? 'text-ink' : 'text-ink-dim'
            ]"
            :style="cellStyle(c)"
            :title="`${c.day}: +${c.words}${c.deleted ? ' / −' + c.deleted : ''}`"
            @click="selected = selected === c.date ? null : c.date"
          >
            <span class="absolute inset-0 flex items-center justify-center">
              {{ c.mood ? MOODS[c.mood] : c.day }}
            </span>
          </button>
        </template>
      </div>

      <!-- selected day -->
      <div v-if="selectedCell" class="mt-2 rounded-lg bg-surface-2 px-2 py-1.5">
        <div class="flex items-baseline justify-between text-[11px]">
          <span class="font-medium">{{ fmtDay(selectedCell.date as string) }}</span>
          <span class="tabular-nums">
            <span class="text-accent">+{{ selectedCell.words.toLocaleString() }}</span>
            <span v-if="selectedCell.deleted" class="ml-1 text-red-400">
              −{{ selectedCell.deleted.toLocaleString() }}
            </span>
          </span>
        </div>
        <p v-if="selectedNote" class="mt-1 text-[11px] text-ink-dim">{{ selectedNote }}</p>
      </div>

      <!-- month totals -->
      <div class="mt-2 grid grid-cols-3 gap-1 text-center">
        <div class="rounded-lg bg-surface-2 py-1.5">
          <div class="text-xs font-semibold tabular-nums">{{ monthStats.written.toLocaleString() }}</div>
          <div class="text-[9px] text-ink-dim">words</div>
        </div>
        <div class="rounded-lg bg-surface-2 py-1.5">
          <div class="text-xs font-semibold tabular-nums">{{ monthStats.activeDays }}</div>
          <div class="text-[9px] text-ink-dim">days</div>
        </div>
        <div class="rounded-lg bg-surface-2 py-1.5">
          <div class="text-xs font-semibold tabular-nums">{{ monthStats.best.toLocaleString() }}</div>
          <div class="text-[9px] text-ink-dim">best</div>
        </div>
      </div>
    </div>
  </section>
</template>
