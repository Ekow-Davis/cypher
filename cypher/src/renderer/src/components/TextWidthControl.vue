<script setup lang="ts">
/**
 * Column width and side-margin controls for the writing toolbars.
 *
 * Like the font controls beside it, this only changes how the writing sits on
 * screen — exports and collaborators are unaffected. The width can be typed or
 * stepped right in the toolbar; the arrow beside it opens presets and the
 * side-margin setting.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { MoveHorizontal, ChevronDown } from 'lucide-vue-next'
import NumberStepper from './NumberStepper.vue'
import {
  usePreferencesStore,
  DEFAULT_TEXT_WIDTH,
  DEFAULT_TEXT_GUTTER,
  TEXT_WIDTH_MIN,
  TEXT_WIDTH_MAX,
  TEXT_GUTTER_MIN,
  TEXT_GUTTER_MAX
} from '@/stores/preferences'

const prefs = usePreferencesStore()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const PRESETS = [
  { label: 'Narrow', ch: 55 },
  { label: 'Standard', ch: DEFAULT_TEXT_WIDTH },
  { label: 'Wide', ch: 90 },
  { label: 'Extra wide', ch: 120 },
  { label: 'Fill', ch: 0 }
]

function onDocClick(e: MouseEvent): void {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent): void {
  if (open.value && e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
})

function reset(): void {
  prefs.setTextWidth(DEFAULT_TEXT_WIDTH)
  prefs.setTextGutter(DEFAULT_TEXT_GUTTER)
}
</script>

<template>
  <div ref="root" class="relative flex items-center">
    <MoveHorizontal :size="14" class="mr-0.5 text-ink-dim" />
    <NumberStepper
      :model-value="prefs.textWidth"
      :min="TEXT_WIDTH_MIN"
      :max="TEXT_WIDTH_MAX"
      :step="5"
      zero-label="Fill"
      title="Text width"
      @update:model-value="prefs.setTextWidth"
    />
    <button
      class="rounded-md p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
      :class="open ? 'bg-surface-2 text-ink' : ''"
      title="Width presets and side margins"
      @click="open = !open"
    >
      <ChevronDown :size="13" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-border bg-surface p-3 shadow-xl"
    >
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs font-semibold">Text width</span>
        <span class="text-[11px] tabular-nums text-ink-dim">
          {{ prefs.textWidth === 0 ? 'Fills the pane' : `~${prefs.textWidth} characters a line` }}
        </span>
      </div>
      <div class="mb-1 flex flex-wrap gap-1">
        <button
          v-for="p in PRESETS"
          :key="p.label"
          class="rounded-md border px-2 py-1 text-[11px]"
          :class="
            prefs.textWidth === p.ch
              ? 'border-accent text-accent'
              : 'border-border text-ink-dim hover:text-ink'
          "
          @click="prefs.setTextWidth(p.ch)"
        >
          {{ p.label }}
        </button>
      </div>
      <p class="mb-3 text-[10px] leading-snug text-ink-dim">
        Type any width from {{ TEXT_WIDTH_MIN }} to {{ TEXT_WIDTH_MAX }} in the toolbar box, or 0
        to fill. ↑/↓ step it; hold Shift for bigger steps.
      </p>

      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs font-semibold">Side margins</span>
        <NumberStepper
          :model-value="prefs.textGutter"
          :min="TEXT_GUTTER_MIN"
          :max="TEXT_GUTTER_MAX"
          :step="4"
          unit="px"
          title="Side margins"
          @update:model-value="prefs.setTextGutter"
        />
      </div>
      <p class="mb-3 text-[10px] leading-snug text-ink-dim">
        The minimum space kept either side of the text. With a set width, any extra room is
        split evenly on both sides.
      </p>

      <label class="mb-3 flex items-center gap-2 text-[11px] text-ink-dim">
        <input
          type="checkbox"
          class="h-3.5 w-3.5"
          :checked="prefs.focusUsesTextWidth"
          @change="prefs.setFocusUsesTextWidth(($event.target as HTMLInputElement).checked)"
        />
        Use this width in focus mode too
      </label>

      <div class="flex justify-end">
        <button class="text-[11px] text-ink-dim hover:text-ink" @click="reset">Reset</button>
      </div>
    </div>
  </div>
</template>
