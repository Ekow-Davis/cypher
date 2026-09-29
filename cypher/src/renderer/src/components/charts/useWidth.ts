import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

/** Tracks an element's width so SVG charts can lay out in real pixels. */
export function useWidth(el: Ref<HTMLElement | null>, fallback = 600): Ref<number> {
  const width = ref(fallback)
  let ro: ResizeObserver | null = null
  onMounted(() => {
    if (!el.value) return
    width.value = el.value.clientWidth || fallback
    ro = new ResizeObserver(() => {
      if (el.value) width.value = el.value.clientWidth || fallback
    })
    ro.observe(el.value)
  })
  onBeforeUnmount(() => ro?.disconnect())
  return width
}

/** A round axis maximum at or above `max` (0, 1, 2, 2.5, 5 × 10ⁿ steps). */
export function niceMax(max: number, ticks = 4): { top: number; step: number } {
  if (!(max > 0)) return { top: ticks, step: 1 }
  const raw = max / ticks
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  return { top: step * ticks, step }
}

export function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K`
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  // Small axes step in halves (2.5, 7.5); don't round those into lies.
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
