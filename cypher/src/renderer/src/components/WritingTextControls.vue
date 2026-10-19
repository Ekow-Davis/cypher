<script setup lang="ts">
/**
 * Compact font, size and width controls for the writing toolbars. Size and
 * width can be typed or stepped.
 *
 * These change how the writing *looks on screen* — the same setting as
 * Settings → Writing — not the formatting stored in the chapter, so an export
 * or a collaborator's screen is unaffected.
 */
import { computed } from 'vue'
import { usePreferencesStore, EDITOR_SIZE_MIN, EDITOR_SIZE_MAX } from '@/stores/preferences'
import { useFontsStore } from '@/stores/fonts'
import { WRITING_FONTS, libraryChoices } from '@/lib/fontChoices'
import TextWidthControl from './TextWidthControl.vue'
import NumberStepper from './NumberStepper.vue'

const prefs = usePreferencesStore()
const fonts = useFontsStore()

const choices = computed(() => [...WRITING_FONTS, ...libraryChoices(fonts.library)])
</script>

<template>
  <div class="flex items-center gap-1">
    <select
      class="max-w-[8.5rem] rounded-md border border-border bg-surface-2 px-1.5 py-1 text-[11px] text-ink-dim outline-none hover:text-ink focus:border-accent-line"
      title="Writing font (display only — does not change exports)"
      :value="prefs.editorFont"
      @change="prefs.setEditorFont(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="c in choices" :key="c.value" :value="c.value">{{ c.label }}</option>
    </select>
    <NumberStepper
      :model-value="prefs.editorFontSize"
      :min="EDITOR_SIZE_MIN"
      :max="EDITOR_SIZE_MAX"
      title="Writing text size"
      box-class="w-7"
      @update:model-value="prefs.setEditorFontSize"
    />
    <span class="mx-1 h-4 w-px shrink-0 bg-border" />
    <TextWidthControl />
  </div>
</template>
