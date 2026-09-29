<script setup lang="ts">
/**
 * Columns from one baseline — histograms and per-hour counts. Bars are
 * capped in thickness with a surface gap between them; each bar is its own
 * hover target, and only the tallest is labelled directly.
 */
import { ref, computed } from 'vue'
import { useWidth, niceMax, compact } from './useWidth'

export interface Bin {
  label: string
  value: number
  /** Tooltip heading; defaults to the label. */
  title?: string
}

const props = withDefaults(
  defineProps<{ bins: Bin[]; height?: number; slot?: number; format?: (n: number) => string; unit?: string }>(),
  { height: 190, slot: 1, format: (n: number) => Math.round(n).toLocaleString(), unit: '' }
)

const root = ref<HTMLElement | null>(null)
const width = useWidth(root)
const M = { l: 40, r: 8, t: 16, b: 22 }
const plotW = computed(() => Math.max(10, width.value - M.l - M.r))
const plotH = computed(() => props.height - M.t - M.b)
const axis = computed(() => niceMax(Math.max(0, ...props.bins.map((b) => b.value))))
const band = computed(() => plotW.value / Math.max(1, props.bins.length))
const barW = computed(() => Math.max(2, Math.min(24, band.value - 2)))
const maxIndex = computed(() => {
  let best = -1
  props.bins.forEach((b, i) => {
    if (b.value > 0 && (best === -1 || b.value > props.bins[best].value)) best = i
  })
  return best
})

function yAt(v: number): number {
  return M.t + plotH.value - (v / axis.value.top) * plotH.value
}
function bx(i: number): number {
  return M.l + i * band.value + (band.value - barW.value) / 2
}
/** Rounded top, square base. */
function barPath(i: number, v: number): string {
  const x = bx(i)
  const w = barW.value
  const y = yAt(v)
  const base = yAt(0)
  const r = Math.min(4, w / 2, Math.max(0, base - y))
  if (base - y <= 0) return ''
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`
}

const yTicks = computed(() => {
  const out: number[] = []
  for (let v = 0; v <= axis.value.top + 1e-9; v += axis.value.step) out.push(v)
  return out
})
const labelEvery = computed(() => Math.max(1, Math.ceil(props.bins.length / Math.max(2, Math.floor(plotW.value / 44)))))

const hover = ref<number | null>(null)
</script>

<template>
  <div ref="root" class="viz-root relative w-full">
    <svg :width="width" :height="height" class="block select-none" role="img">
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
      <g v-for="(b, i) in bins" :key="b.label">
        <path :d="barPath(i, b.value)" :fill="`var(--series-${slot})`" :opacity="hover === null || hover === i ? 1 : 0.55" />
        <rect
          :x="M.l + i * band"
          :y="M.t"
          :width="band"
          :height="plotH"
          fill="transparent"
          @pointerenter="hover = i"
          @pointerleave="hover = null"
        />
        <text
          v-if="i % labelEvery === 0"
          :x="bx(i) + barW / 2"
          :y="height - 6"
          text-anchor="middle"
          class="fill-[var(--color-ink-dim)] text-[10px]"
        >
          {{ b.label }}
        </text>
        <text
          v-if="i === maxIndex"
          :x="bx(i) + barW / 2"
          :y="yAt(b.value) - 4"
          text-anchor="middle"
          class="fill-[var(--color-ink)] text-[10px] font-semibold tabular-nums"
        >
          {{ compact(b.value) }}
        </text>
      </g>
    </svg>
    <div
      v-if="hover !== null && bins[hover]"
      class="viz-tip"
      :style="{ left: Math.min(width - 150, bx(hover) + barW + 6) + 'px', top: '4px' }"
    >
      <div class="text-sm font-semibold tabular-nums text-ink">{{ format(bins[hover].value) }}{{ unit }}</div>
      <div class="text-ink-dim">{{ bins[hover].title ?? bins[hover].label }}</div>
    </div>
  </div>
</template>
