import { computed, type ComputedRef, type Ref } from 'vue'
import type { CSSProperties } from 'vue'
import { usePreferencesStore } from '@/stores/preferences'

/** Focus-mode presets, in characters per line. */
export const FOCUS_WIDTH_CH: Record<string, number> = {
  narrow: 55,
  medium: 70,
  wide: 100
}

/**
 * Sizing for the manuscript/lore text column.
 *
 * The width is measured in `ch` of the *writing* font at the writing size, so
 * "80 characters" stays roughly 80 characters a line whatever font or size is
 * chosen. `textWidth` 0 lets the column fill the pane, leaving only the gutter.
 */
export function useTextColumn(focus: Ref<boolean> | ComputedRef<boolean>): {
  columnStyle: ComputedRef<CSSProperties>
  surfaceStyle: ComputedRef<CSSProperties>
} {
  const prefs = usePreferencesStore()

  const widthCh = computed(() => {
    if (focus.value && !prefs.focusUsesTextWidth) return FOCUS_WIDTH_CH[prefs.focusWidth] ?? 70
    return prefs.textWidth
  })

  const columnStyle = computed<CSSProperties>(() => ({
    fontFamily: 'var(--font-editor)',
    fontSize: 'var(--editor-size)',
    maxWidth: widthCh.value > 0 ? `${widthCh.value}ch` : 'none',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto'
  }))

  const surfaceStyle = computed<CSSProperties>(() => ({
    paddingLeft: `${prefs.textGutter}px`,
    paddingRight: `${prefs.textGutter}px`
  }))

  return { columnStyle, surfaceStyle }
}
