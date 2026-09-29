<script setup lang="ts">
/**
 * A grid of cells shaded by amount — one hue (the accent), light to dark.
 * Used for weekday × hour and for the year calendar.
 */
import { ref, computed } from 'vue'

export interface HeatCell {
  row: number
  col: number
  value: number
  title: string
}

const props = withDefaults(
  defineProps<{
    rows: string[]
    cols: string[]
    cells: HeatCell[]
    cell?: number
    /** Show only every nth column label. */
    colLabelEvery?: number
    format?: (n: number) => string
    /** Stretch cells to the card's width (keeping them square) instead of a fixed size. */
    stretch?: boolean
  }>(),
  { cell: 14, colLabelEvery: 1, format: (n: number) => Math.round(n).toLocaleString() }
)

/** Five steps by quantile of the non-zero values, so one huge day doesn't wash out the rest. */
const thresholds = computed(() => {
  const vals = props.cells.map((c) => c.value).filter((v) => v > 0).sort((a, b) => a - b)
  if (!vals.length) return [Infinity, Infinity, Infinity, Infinity]
  const q = (p: number): number => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]
  return [q(0.2), q(0.45), q(0.7), q(0.9)]
})
const STEPS = [0, 22, 42, 64, 86]
function level(v: number): number {
  if (v <= 0) return -1
  const t = thresholds.value
  return v < t[0] ? 0 : v < t[1] ? 1 : v < t[2] ? 2 : v < t[3] ? 3 : 4
}
function fill(v: number): string {
  const l = level(v)
  if (l < 0) return 'var(--color-surface-2)'
  return `color-mix(in oklab, var(--color-accent) ${STEPS[l] + 14}%, var(--color-surface-2))`
}

const byKey = computed(() => {
  const m = new Map<string, HeatCell>()
  for (const c of props.cells) m.set(`${c.row}-${c.col}`, c)
  return m
})

const gap = 3
const hover = ref<HeatCell | null>(null)
const hoverPos = ref({ x: 0, y: 0 })
function enter(c: HeatCell, e: PointerEvent): void {
  hover.value = c
  const host = (e.currentTarget as Element).closest('.heat-host') as HTMLElement
  const r = host.getBoundingClientRect()
  hoverPos.value = { x: e.clientX - r.left + 12, y: e.clientY - r.top + 12 }
}
</script>

<template>
  <div class="heat-host viz-root relative overflow-x-auto">
    <div
      :class="stretch ? 'grid w-full' : 'inline-grid'"
      :style="{
        gridTemplateColumns: `auto repeat(${cols.length}, ${stretch ? `minmax(${cell}px, 1fr)` : `${cell}px`})`,
        gap: gap + 'px'
      }"
    >
      <span />
      <span
        v-for="(c, i) in cols"
        :key="`c${i}`"
        class="whitespace-nowrap text-[9px] leading-none text-ink-dim"
        :style="{ height: '12px' }"
      >
        {{ i % colLabelEvery === 0 ? c : '' }}
      </span>
      <template v-for="(r, ri) in rows" :key="`r${ri}`">
        <span class="flex items-center justify-end pr-1.5 text-[10px] leading-none text-ink-dim">{{ r }}</span>
        <span
          v-for="(_c, ci) in cols"
          :key="`${ri}-${ci}`"
          class="rounded-[3px] transition-[outline]"
          :style="{
            width: stretch ? '100%' : cell + 'px',
            height: stretch ? 'auto' : cell + 'px',
            aspectRatio: stretch ? '1 / 1' : undefined,
            minHeight: cell + 'px',
            background: fill(byKey.get(`${ri}-${ci}`)?.value ?? 0),
            outline: hover && hover.row === ri && hover.col === ci ? '2px solid var(--color-ink)' : 'none'
          }"
          @pointerenter="(e) => { const cellData = byKey.get(`${ri}-${ci}`); if (cellData) enter(cellData, e) }"
          @pointerleave="hover = null"
        />
      </template>
    </div>
    <div class="mt-2 flex items-center gap-1 text-[10px] text-ink-dim">
      Less
      <span class="h-2.5 w-2.5 rounded-[3px]" :style="{ background: 'var(--color-surface-2)' }" />
      <span v-for="(s, i) in STEPS" :key="i" class="h-2.5 w-2.5 rounded-[3px]" :style="{ background: `color-mix(in oklab, var(--color-accent) ${s + 14}%, var(--color-surface-2))` }" />
      More
    </div>
    <div v-if="hover" class="viz-tip" :style="{ left: hoverPos.x + 'px', top: hoverPos.y + 'px' }">
      <div class="text-sm font-semibold tabular-nums text-ink">{{ format(hover.value) }}</div>
      <div class="text-ink-dim">{{ hover.title }}</div>
    </div>
  </div>
</template>
