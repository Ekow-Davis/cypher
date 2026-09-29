<script setup lang="ts">
/**
 * Area/line chart over a category axis (days, weeks). One y-axis only; a
 * crosshair snaps to the nearest position and one tooltip lists every series.
 */
import { ref, computed } from 'vue'
import { useWidth, niceMax, compact } from './useWidth'

export interface AreaSeries {
  name: string
  values: number[]
  /** Categorical slot 1–6. */
  slot: number
  kind: 'area' | 'line'
}

const props = withDefaults(
  defineProps<{
    labels: string[]
    series: AreaSeries[]
    height?: number
    format?: (n: number) => string
  }>(),
  { height: 220, format: (n: number) => Math.round(n).toLocaleString() }
)

const root = ref<HTMLElement | null>(null)
const width = useWidth(root)
const M = { l: 44, r: 12, t: 10, b: 24 }
const plotW = computed(() => Math.max(10, width.value - M.l - M.r))
const plotH = computed(() => props.height - M.t - M.b)

const axis = computed(() => niceMax(Math.max(0, ...props.series.flatMap((s) => s.values))))
const n = computed(() => props.labels.length)
function xAt(i: number): number {
  return M.l + (n.value <= 1 ? plotW.value / 2 : (i / (n.value - 1)) * plotW.value)
}
function yAt(v: number): number {
  return M.t + plotH.value - (v / axis.value.top) * plotH.value
}

function linePath(values: number[]): string {
  return values.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join('')
}
function areaPath(values: number[]): string {
  if (!values.length) return ''
  const base = yAt(0)
  return `${linePath(values)}L${xAt(values.length - 1).toFixed(1)},${base}L${xAt(0).toFixed(1)},${base}Z`
}

const yTicks = computed(() => {
  const out: number[] = []
  for (let v = 0; v <= axis.value.top + 1e-9; v += axis.value.step) out.push(v)
  return out
})
/** About one x label per 90px, always including the last. */
const xTicks = computed(() => {
  const every = Math.max(1, Math.ceil(n.value / Math.max(2, Math.floor(plotW.value / 90))))
  const out: number[] = []
  for (let i = 0; i < n.value; i += every) out.push(i)
  if (n.value && out[out.length - 1] !== n.value - 1 && n.value - 1 - out[out.length - 1] > every / 2) out.push(n.value - 1)
  return out
})

const hover = ref<number | null>(null)
function onMove(e: PointerEvent): void {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  if (n.value <= 1) {
    hover.value = 0
    return
  }
  const i = Math.round(((x - M.l) / plotW.value) * (n.value - 1))
  hover.value = Math.max(0, Math.min(n.value - 1, i))
}
const tipLeft = computed(() => {
  if (hover.value === null) return 0
  const x = xAt(hover.value)
  return x > width.value - 170 ? x - 160 : x + 12
})
</script>

<template>
  <div ref="root" class="viz-root relative w-full">
    <div v-if="series.length > 1" class="mb-2 flex flex-wrap gap-3 text-[11px] text-ink-dim">
      <span v-for="s in series" :key="s.name" class="flex items-center gap-1.5">
        <span
          :class="s.kind === 'area' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-3.5 rounded'"
          :style="{ background: `var(--series-${s.slot})` }"
        />
        {{ s.name }}
      </span>
    </div>
    <svg
      :width="width"
      :height="height"
      class="block touch-none select-none"
      role="img"
      @pointermove="onMove"
      @pointerleave="hover = null"
    >
      <g>
        <line
          v-for="t in yTicks"
          :key="t"
          :x1="M.l"
          :x2="width - M.r"
          :y1="yAt(t)"
          :y2="yAt(t)"
          stroke="var(--viz-grid)"
          stroke-width="1"
        />
        <text
          v-for="t in yTicks"
          :key="`l${t}`"
          :x="M.l - 6"
          :y="yAt(t) + 3"
          text-anchor="end"
          class="fill-[var(--color-ink-dim)] text-[10px] tabular-nums"
        >
          {{ compact(t) }}
        </text>
        <text
          v-for="i in xTicks"
          :key="`x${i}`"
          :x="xAt(i)"
          :y="height - 6"
          :text-anchor="i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'"
          class="fill-[var(--color-ink-dim)] text-[10px]"
        >
          {{ labels[i] }}
        </text>
      </g>
      <g v-for="s in series" :key="s.name">
        <path v-if="s.kind === 'area'" :d="areaPath(s.values)" :fill="`var(--series-${s.slot})`" fill-opacity="0.12" />
        <path
          :d="linePath(s.values)"
          fill="none"
          :stroke="`var(--series-${s.slot})`"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </g>
      <g v-if="hover !== null">
        <line :x1="xAt(hover)" :x2="xAt(hover)" :y1="M.t" :y2="M.t + plotH" stroke="var(--color-ink-dim)" stroke-width="1" stroke-opacity="0.5" />
        <circle
          v-for="s in series"
          :key="`d${s.name}`"
          :cx="xAt(hover)"
          :cy="yAt(s.values[hover] ?? 0)"
          r="4"
          :fill="`var(--series-${s.slot})`"
          stroke="var(--color-surface)"
          stroke-width="2"
        />
      </g>
    </svg>
    <div v-if="hover !== null" class="viz-tip" :style="{ left: tipLeft + 'px', top: '8px' }">
      <div class="mb-1 text-ink-dim">{{ labels[hover] }}</div>
      <div v-for="s in series" :key="`t${s.name}`" class="flex items-center gap-2">
        <span class="h-0.5 w-3 rounded" :style="{ background: `var(--series-${s.slot})` }" />
        <span class="font-semibold tabular-nums text-ink">{{ format(s.values[hover] ?? 0) }}</span>
        <span class="text-ink-dim">{{ s.name }}</span>
      </div>
    </div>
  </div>
</template>
