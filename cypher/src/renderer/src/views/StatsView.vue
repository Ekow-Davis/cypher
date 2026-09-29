<script setup lang="ts">
/**
 * Writing statistics: how much, how fast, when, and where.
 *
 * Everything here is computed from counts collected while writing (never
 * text). One row of filters at the top scopes every chart and figure below it.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  RefreshCw,
  ChartLine,
  Flame,
  Timer,
  Keyboard,
  Clock,
  Trophy,
  Sparkles,
  Table2
} from 'lucide-vue-next'
import AreaChart from '@/components/charts/AreaChart.vue'
import DonutChart, { type DonutSegment } from '@/components/charts/DonutChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import HeatGrid, { type HeatCell } from '@/components/charts/HeatGrid.vue'
import { usePreferencesStore } from '@/stores/preferences'
import { aggregate, duration, dayKey, wpm } from '@/lib/statsAggregate'
import { flushStats } from '@/lib/statsTracker'
import type { StatsSummary, StatsArea } from '@shared/types'

const router = useRouter()
const prefs = usePreferencesStore()

const summary = ref<StatsSummary | null>(null)
const loading = ref(false)

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'Year', days: 365 },
  { label: 'All time', days: null }
] as const
const range = ref<number | null>(30)
const bookId = ref<number | null>(null)
const cumulative = ref(false)
const showTable = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    await flushStats()
    summary.value = await window.cypher.stats.summary()
  } finally {
    loading.value = false
  }
}
onMounted(load)

const view = computed(() => (summary.value ? aggregate(summary.value, { days: range.value, bookId: bookId.value }) : null))
const bookNames = computed(() => new Map((summary.value?.books ?? []).map((b) => [b.id, b.title])))
const hasData = computed(() => !!summary.value?.hours.length)

const nf = (n: number): string => Math.round(n).toLocaleString()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}
function hourLabel(h: number): string {
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
}

// ---------- words over time ----------
const dailySeries = computed(() => {
  const v = view.value
  if (!v) return { labels: [], series: [] }
  const labels = v.daily.map((d) => shortDay(d.day))
  if (cumulative.value) {
    let run = 0
    const values = v.daily.map((d) => (run += d.added - d.deleted))
    return { labels, series: [{ name: 'Net words, running total', values, slot: 1, kind: 'area' as const }] }
  }
  return {
    labels,
    series: [
      { name: 'Written', values: v.daily.map((d) => d.added), slot: 1, kind: 'area' as const },
      { name: 'Deleted', values: v.daily.map((d) => d.deleted), slot: 2, kind: 'line' as const }
    ]
  }
})

// ---------- where time goes ----------
const AREA_LABEL: Record<StatsArea, string> = {
  book: 'Books',
  document: 'Documents',
  diary: 'Diary',
  reader: 'Reader',
  other: 'Elsewhere (settings, shelves)'
}
const AREA_ORDER: StatsArea[] = ['book', 'document', 'diary', 'reader', 'other']
const areaSegments = computed<DonutSegment[]>(() => {
  const v = view.value
  if (!v) return []
  return AREA_ORDER.map((a, i) => ({ label: AREA_LABEL[a], value: v.byArea.get(a)?.app ?? 0, slot: i + 1 })).filter(
    (s) => s.value > 0
  )
})

// ---------- books ----------
const bookRows = computed(() => {
  const v = view.value
  if (!v) return []
  return [...v.byBook.entries()]
    .map(([id, b]) => ({ id, title: bookNames.value.get(id) ?? `Book ${id}`, ...b }))
    .sort((a, b) => b.added - a.added || b.app - a.app)
})
/**
 * Each book keeps its colour whatever the filter: the five books with the
 * most words of all time own slots 1–5; everything else is "Other books".
 */
const bookSlots = computed(() => {
  const totals = new Map<number, number>()
  for (const h of summary.value?.hours ?? []) {
    if (h.area === 'book' && h.scope_id) totals.set(h.scope_id, (totals.get(h.scope_id) ?? 0) + h.words_added)
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  return new Map(ranked.map(([id], i) => [id, i + 1]))
})
const bookSegments = computed<DonutSegment[]>(() => {
  const rows = bookRows.value.filter((r) => r.added > 0)
  const named = rows
    .filter((r) => bookSlots.value.has(r.id))
    .map((r) => ({ label: r.title, value: r.added, slot: bookSlots.value.get(r.id)! }))
    .sort((a, b) => a.slot - b.slot)
  const rest = rows.filter((r) => !bookSlots.value.has(r.id)).reduce((s, r) => s + r.added, 0)
  if (rest > 0) named.push({ label: 'Other books', value: rest, slot: 6 })
  return named
})
const favourite = computed(() => {
  const rows = bookRows.value
  if (!rows.length) return null
  const byWords = [...rows].sort((a, b) => b.added - a.added)[0]
  const byTime = [...rows].sort((a, b) => b.app - a.app)[0]
  return { byWords, byTime }
})

// ---------- rhythm ----------
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const weekHourCells = computed<HeatCell[]>(() => {
  const v = view.value
  if (!v) return []
  const out: HeatCell[] = []
  v.weekHour.forEach((row, r) =>
    row.forEach((value, c) => out.push({ row: r, col: c, value, title: `${WEEKDAYS[r]}, ${hourLabel(c)} – ${hourLabel((c + 1) % 24)} · words` }))
  )
  return out
})
const HOURS = Array.from({ length: 24 }, (_, h) => hourLabel(h))

// ---------- speed & sessions ----------
const speedBins = computed(() => {
  const samples = view.value?.speed.samples ?? []
  if (!samples.length) return []
  const top = Math.min(200, Math.max(...samples))
  const width = 10
  const bins = Array.from({ length: Math.max(1, Math.ceil((top + 1) / width)) }, (_, i) => ({
    label: `${i * width}`,
    title: `${i * width}–${i * width + width - 1} words per minute`,
    value: 0
  }))
  for (const s of samples) bins[Math.min(bins.length - 1, Math.floor(s / width))].value++
  return bins
})
const SESSION_EDGES = [5, 15, 30, 60, 90, 120, 180, Infinity]
const sessionBins = computed(() => {
  const lengths = view.value?.sessions.lengths ?? []
  const labels = ['<5m', '5–15m', '15–30m', '30–60m', '1–1.5h', '1.5–2h', '2–3h', '3h+']
  const bins = labels.map((label) => ({ label, value: 0, title: `${label} sessions` }))
  for (const m of lengths) bins[SESSION_EDGES.findIndex((e) => m < e)].value++
  return bins
})

// ---------- the year ----------
const calendar = computed(() => {
  const v = summary.value
  if (!v) return { cols: [] as string[], cells: [] as HeatCell[] }
  const words = new Map<string, number>()
  for (const h of v.hours) {
    if (bookId.value !== null && !(h.area === 'book' && h.scope_id === bookId.value)) continue
    const d = h.hour.slice(0, 10)
    words.set(d, (words.get(d) ?? 0) + h.words_added)
  }
  const today = new Date()
  // Start on the Monday 52 weeks back so columns are whole weeks.
  const start = new Date(today)
  start.setDate(start.getDate() - 364 - ((start.getDay() + 6) % 7))
  const cols: string[] = []
  const cells: HeatCell[] = []
  for (let w = 0; w < 53; w++) {
    const first = new Date(start)
    first.setDate(start.getDate() + w * 7)
    cols.push(first.getDate() <= 7 ? MONTHS[first.getMonth()] : '')
    for (let d = 0; d < 7; d++) {
      const day = new Date(start)
      day.setDate(start.getDate() + w * 7 + d)
      if (day > today) continue
      const key = dayKey(day)
      cells.push({ row: d, col: w, value: words.get(key) ?? 0, title: `${shortDay(key)} ${day.getFullYear()} · words written` })
    }
  }
  return { cols, cells }
})

// ---------- fun facts ----------
const facts = computed(() => {
  const v = view.value
  if (!v) return []
  const out: { label: string; value: string }[] = []
  if (v.bestDay && v.bestDay.added > 0) out.push({ label: 'Best day', value: `${nf(v.bestDay.added)} words on ${shortDay(v.bestDay.day)}` })
  if (v.bestHour !== null) out.push({ label: 'Most productive hour', value: `${hourLabel(v.bestHour)} – ${hourLabel((v.bestHour + 1) % 24)}` })
  if (v.sessions.longest)
    out.push({ label: 'Longest sitting', value: `${duration(v.sessions.longest.active_seconds)} of writing, ${nf(v.sessions.longest.words_added)} words` })
  if (v.totals.keystrokes > 0)
    out.push({ label: 'Backspace rate', value: `${((v.totals.backspaces / v.totals.keystrokes) * 100).toFixed(1)}% of keystrokes` })
  if (v.totals.added + v.totals.deleted > 0)
    out.push({ label: 'Kept', value: `${Math.round(Math.max(0, 1 - v.totals.deleted / Math.max(1, v.totals.added)) * 100)}% of the words you wrote` })
  if (v.totals.pasted > 0) out.push({ label: 'Pasted in', value: `${nf(v.totals.pasted)} words (not counted as written)` })
  if (v.writingDays > 0 && v.totals.added > 0)
    out.push({ label: 'Average writing day', value: `${nf(v.totals.added / v.writingDays)} words over ${v.writingDays} day${v.writingDays === 1 ? '' : 's'}` })
  const novel = 80_000
  if (v.totals.added > 0) out.push({ label: 'Novel meter', value: `${((v.totals.added / novel) * 100).toFixed(1)}% of an 80,000-word novel` })
  return out
})

const tiles = computed(() => {
  const v = view.value
  if (!v) return []
  const avgSession = v.sessions.count
    ? duration((v.sessions.lengths.reduce((a, b) => a + b, 0) / v.sessions.count) * 60)
    : ''
  const list: { icon: typeof Timer; label: string; value: string; sub?: string }[] = [
    { icon: Timer, label: 'Writing time', value: duration(v.totals.active) },
    { icon: Clock, label: 'Time in Cypher', value: duration(v.totals.app) },
    {
      icon: Keyboard,
      label: 'Typing speed',
      value: v.speed.average ? `${Math.round(v.speed.average)} wpm` : '—',
      sub: v.speed.best ? `best ${Math.round(v.speed.best)} wpm` : ''
    },
    { icon: Flame, label: 'Current streak', value: `${v.streak.current} day${v.streak.current === 1 ? '' : 's'}` },
    { icon: Trophy, label: 'Longest streak', value: `${v.streak.longest} day${v.streak.longest === 1 ? '' : 's'}` },
    { icon: ChartLine, label: 'Sessions', value: nf(v.sessions.count), sub: avgSession ? `avg ${avgSession}` : '' }
  ]
  return list
})

async function enable(): Promise<void> {
  prefs.setStatsEnabled(true)
}
</script>

<template>
  <section class="viz-root mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <button class="flex items-center gap-1 text-sm text-ink-dim hover:text-ink" @click="router.back()">
        <ArrowLeft :size="17" /> Back
      </button>
      <h1 class="flex items-center gap-2 text-2xl font-bold">
        <ChartLine :size="22" class="text-accent" /> Writing stats
      </h1>
      <span class="flex-1" />
      <button
        class="rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink"
        title="Refresh"
        @click="load"
      >
        <RefreshCw :size="15" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div v-if="!prefs.statsEnabled" class="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-sm">
      <span class="flex-1">Statistics are switched off, so nothing new is being counted.</span>
      <button class="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent" @click="enable">Turn on</button>
    </div>

    <!-- filters: one row, scoping everything below -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <div class="inline-flex rounded-xl border border-border bg-surface-2 p-1">
        <button
          v-for="r in RANGES"
          :key="r.label"
          class="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
          :class="range === r.days ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
          @click="range = r.days"
        >
          {{ r.label }}
        </button>
      </div>
      <select
        v-model="bookId"
        class="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs outline-none focus:border-accent-line"
      >
        <option :value="null">All writing</option>
        <option v-for="b in summary?.books ?? []" :key="b.id" :value="b.id">{{ b.title }}</option>
      </select>
    </div>

    <div v-if="summary && !hasData" class="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-ink-dim">
      <Sparkles :size="28" class="mx-auto mb-3 text-accent" />
      <p class="font-medium text-ink">Nothing counted yet.</p>
      <p class="mt-1 text-sm">Write for a few minutes and come back — the charts fill in as you go.</p>
    </div>

    <template v-else-if="view">
      <!-- headline -->
      <div class="mb-6 grid gap-3 lg:grid-cols-[1.3fr_2fr]">
        <div class="rounded-2xl border border-border bg-surface p-5">
          <div class="text-sm text-ink-dim">Words written</div>
          <div class="text-5xl font-semibold tracking-tight">{{ nf(view.totals.added) }}</div>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-dim">
            <span><span class="font-medium text-ink">{{ nf(view.totals.deleted) }}</span> deleted</span>
            <span><span class="font-medium text-ink">{{ nf(view.totals.added - view.totals.deleted) }}</span> net</span>
            <span><span class="font-medium text-ink">{{ nf(view.totals.chars) }}</span> characters typed</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div v-for="tile in tiles" :key="tile.label" class="rounded-2xl border border-border bg-surface p-3.5">
            <div class="flex items-center gap-1.5 text-xs text-ink-dim">
              <component :is="tile.icon" :size="13" /> {{ tile.label }}
            </div>
            <div class="mt-1 text-xl font-semibold tabular-nums">{{ tile.value }}</div>
            <div v-if="tile.sub" class="text-[11px] text-ink-dim">{{ tile.sub }}</div>
          </div>
        </div>
      </div>

      <!-- words over time -->
      <div class="mb-6 rounded-2xl border border-border bg-surface p-5">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <h2 class="font-semibold">{{ cumulative ? 'Your manuscript growing' : 'Words per day' }}</h2>
          <span class="flex-1" />
          <div class="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
            <button class="rounded-md px-2 py-0.5" :class="!cumulative ? 'bg-surface shadow-sm' : 'text-ink-dim'" @click="cumulative = false">Daily</button>
            <button class="rounded-md px-2 py-0.5" :class="cumulative ? 'bg-surface shadow-sm' : 'text-ink-dim'" @click="cumulative = true">Running total</button>
          </div>
          <button class="rounded-lg border border-border p-1 text-ink-dim hover:text-ink" :class="showTable ? 'text-accent' : ''" title="Show as a table" @click="showTable = !showTable">
            <Table2 :size="14" />
          </button>
        </div>
        <AreaChart v-if="!showTable" :labels="dailySeries.labels" :series="dailySeries.series" :height="240" />
        <div v-else class="max-h-72 overflow-auto">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-surface text-left text-ink-dim">
              <tr><th class="py-1 pr-2 font-medium">Day</th><th class="pr-2 text-right font-medium">Written</th><th class="pr-2 text-right font-medium">Deleted</th><th class="text-right font-medium">Writing time</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in [...view.daily].reverse()" :key="d.day" class="border-t border-border">
                <td class="py-1 pr-2">{{ shortDay(d.day) }}</td>
                <td class="pr-2 text-right tabular-nums">{{ nf(d.added) }}</td>
                <td class="pr-2 text-right tabular-nums">{{ nf(d.deleted) }}</td>
                <td class="text-right tabular-nums">{{ duration(d.active) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="mb-6 grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="mb-1 font-semibold">Where your time goes</h2>
          <p class="mb-4 text-xs text-ink-dim">Time with Cypher open and in use, by area.</p>
          <DonutChart v-if="areaSegments.length" :segments="areaSegments" :format="duration" center-label="in Cypher" />
          <p v-else class="text-sm text-ink-dim">No time recorded in this range.</p>
        </div>
        <div class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="mb-1 font-semibold">Favourite books</h2>
          <p v-if="favourite" class="mb-4 text-xs text-ink-dim">
            Most words: <span class="font-medium text-ink">{{ favourite.byWords.title }}</span>.
            Most time: <span class="font-medium text-ink">{{ favourite.byTime.title }}</span>.
          </p>
          <DonutChart v-if="bookSegments.length" :segments="bookSegments" center-label="words" />
          <p v-else class="text-sm text-ink-dim">No book writing in this range.</p>
        </div>
      </div>

      <div class="mb-6 rounded-2xl border border-border bg-surface p-5">
        <h2 class="mb-1 font-semibold">When you write</h2>
        <p class="mb-4 text-xs text-ink-dim">Words written by day of the week and hour.</p>
        <HeatGrid :rows="WEEKDAYS" :cols="HOURS" :cells="weekHourCells" :cell="16" :col-label-every="3" stretch />
      </div>

      <div class="mb-6 grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="mb-1 font-semibold">Typing speed</h2>
          <p class="mb-4 text-xs text-ink-dim">Stretches of steady typing, by words per minute.</p>
          <BarChart v-if="speedBins.length" :bins="speedBins" :slot="1" unit=" stretches" />
          <p v-else class="text-sm text-ink-dim">Type steadily for twenty seconds or so to get a reading.</p>
        </div>
        <div class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="mb-1 font-semibold">How long you sit</h2>
          <p class="mb-4 text-xs text-ink-dim">Writing sessions by length of actual writing.</p>
          <BarChart v-if="view.sessions.count" :bins="sessionBins" :slot="3" unit=" sessions" />
          <p v-else class="text-sm text-ink-dim">No sessions in this range.</p>
        </div>
      </div>

      <div class="mb-6 rounded-2xl border border-border bg-surface p-5">
        <h2 class="mb-1 font-semibold">Your year</h2>
        <p class="mb-4 text-xs text-ink-dim">Every day of the last twelve months.</p>
        <HeatGrid :rows="['Mon', '', 'Wed', '', 'Fri', '', 'Sun']" :cols="calendar.cols" :cells="calendar.cells" :cell="13" />
      </div>

      <div class="mb-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="mb-3 font-semibold">By book</h2>
          <p v-if="!bookRows.length" class="text-sm text-ink-dim">No book writing in this range.</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs text-ink-dim">
                <tr>
                  <th class="pb-2 pr-3 font-medium">Book</th>
                  <th class="pb-2 pr-3 text-right font-medium">Written</th>
                  <th class="pb-2 pr-3 text-right font-medium">Deleted</th>
                  <th class="pb-2 pr-3 text-right font-medium">Writing</th>
                  <th class="pb-2 pr-3 text-right font-medium">Open</th>
                  <th class="pb-2 text-right font-medium" title="Characters typed per minute of writing time, as words">Pace</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in bookRows" :key="b.id" class="border-t border-border">
                  <td class="max-w-[14rem] truncate py-1.5 pr-3">{{ b.title }}</td>
                  <td class="pr-3 text-right tabular-nums">{{ nf(b.added) }}</td>
                  <td class="pr-3 text-right tabular-nums">{{ nf(b.deleted) }}</td>
                  <td class="pr-3 text-right tabular-nums">{{ duration(b.active) }}</td>
                  <td class="pr-3 text-right tabular-nums">{{ duration(b.app) }}</td>
                  <td class="text-right tabular-nums">{{ b.active ? `${Math.round(wpm(b.chars, b.active))} wpm` : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="mb-3 flex items-center gap-1.5 font-semibold"><Sparkles :size="15" class="text-accent" /> Did you know</h2>
          <dl class="space-y-2.5">
            <div v-for="f in facts" :key="f.label">
              <dt class="text-xs text-ink-dim">{{ f.label }}</dt>
              <dd class="text-sm">{{ f.value }}</dd>
            </div>
          </dl>
          <p v-if="!facts.length" class="text-sm text-ink-dim">Write a little more to unlock these.</p>
        </div>
      </div>

      <p class="text-center text-[11px] text-ink-dim">
        Counts only — Cypher never stores what you type for statistics. Words pasted in aren't counted
        as written. Speed uses the standard five characters per word.
      </p>
    </template>
  </section>
</template>
