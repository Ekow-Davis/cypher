import { ref, computed, onMounted, onBeforeUnmount, type ComputedRef, type Ref } from 'vue'

/**
 * Tracks the window width so layouts can switch from side-by-side columns to
 * overlay drawers. Needed because the app must survive being snapped to half a
 * screen, where three inline columns simply don't fit.
 */
export function useBreakpoint(): {
  width: Ref<number>
  isNarrow: ComputedRef<boolean>
  isTight: ComputedRef<boolean>
} {
  const width = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)

  function onResize(): void {
    width.value = window.innerWidth
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))

  return {
    width,
    // one side panel still fits, but not two
    isNarrow: computed(() => width.value < 1180),
    // panels must float over the content instead of squeezing it
    isTight: computed(() => width.value < 900)
  }
}
