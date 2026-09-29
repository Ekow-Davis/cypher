<script setup lang="ts">
/**
 * Part-to-whole at a glance (≤ 6 segments — callers fold the rest into
 * "Other"). The legend beside it carries every label and value, so nothing
 * depends on telling colours apart or on hovering.
 */
import { ref, computed } from 'vue'

export interface DonutSegment {
  label: string
  value: number
  slot: number
}

const props = withDefaults(
  defineProps<{ segments: DonutSegment[]; format?: (n: number) => string; centerLabel?: string; size?: number }>(),
  { format: (n: number) => Math.round(n).toLocaleString(), centerLabel: 'Total', size: 168 }
)

const hover = ref<number | null>(null)
const total = computed(() => props.segments.reduce((s, x) => s + x.value, 0))

const arcs = computed(() => {
  const r = props.size / 2
  const inner = r * 0.62
  let angle = -Math.PI / 2
  return props.segments.map((seg) => {
    const frac = total.value ? seg.value / total.value : 0
    const a0 = angle
    const a1 = angle + frac * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (rad: number, a: number): string => `${(r + rad * Math.cos(a)).toFixed(2)},${(r + rad * Math.sin(a)).toFixed(2)}`
    // A lone full circle can't be drawn as one arc; split it in two.
    const d =
      frac >= 0.9999
        ? `M${p(r, a0)}A${r},${r} 0 1 1 ${p(r, a0 + Math.PI)}A${r},${r} 0 1 1 ${p(r, a0)}M${p(inner, a0)}A${inner},${inner} 0 1 0 ${p(inner, a0 + Math.PI)}A${inner},${inner} 0 1 0 ${p(inner, a0)}Z`
        : `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(inner, a1)}A${inner},${inner} 0 ${large} 0 ${p(inner, a0)}Z`
    return { d, seg, frac }
  })
})

function pct(f: number): string {
  return f >= 0.1 ? `${Math.round(f * 100)}%` : `${(f * 100).toFixed(1)}%`
}
</script>

<template>
  <div class="viz-root flex flex-wrap items-center gap-5">
    <div class="relative shrink-0" :style="{ width: size + 'px', height: size + 'px' }">
      <svg :width="size" :height="size" role="img">
        <path
          v-for="(a, i) in arcs"
          :key="a.seg.label"
          :d="a.d"
          :fill="`var(--series-${a.seg.slot})`"
          fill-rule="evenodd"
          stroke="var(--color-surface)"
          stroke-width="2"
          class="cursor-default transition-opacity"
          :opacity="hover === null || hover === i ? 1 : 0.35"
          @pointerenter="hover = i"
          @pointerleave="hover = null"
        />
      </svg>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <template v-if="hover !== null && segments[hover]">
          <span class="text-base font-semibold tabular-nums">{{ format(segments[hover].value) }}</span>
          <span class="max-w-[6.5rem] truncate text-[10px] text-ink-dim">{{ segments[hover].label }}</span>
        </template>
        <template v-else>
          <span class="text-base font-semibold tabular-nums">{{ format(total) }}</span>
          <span class="text-[10px] text-ink-dim">{{ centerLabel }}</span>
        </template>
      </div>
    </div>
    <ul class="min-w-[10rem] flex-1 space-y-1.5">
      <li
        v-for="(a, i) in arcs"
        :key="`l${a.seg.label}`"
        class="flex items-center gap-2 rounded-md px-1 text-xs transition-colors"
        :class="hover === i ? 'bg-surface-2' : ''"
        @pointerenter="hover = i"
        @pointerleave="hover = null"
      >
        <span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: `var(--series-${a.seg.slot})` }" />
        <span class="min-w-0 flex-1 truncate">{{ a.seg.label }}</span>
        <span class="shrink-0 font-medium tabular-nums">{{ format(a.seg.value) }}</span>
        <span class="w-10 shrink-0 text-right tabular-nums text-ink-dim">{{ pct(a.frac) }}</span>
      </li>
    </ul>
  </div>
</template>
