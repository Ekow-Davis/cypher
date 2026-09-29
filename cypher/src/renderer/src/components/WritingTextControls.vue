<script setup lang="ts">
/**
 * Compact font and size controls for the writing toolbars.
 *
 * These change how the writing *looks on screen* — the same setting as
 * Settings → Writing — not the formatting stored in the chapter, so an export
 * or a collaborator's screen is unaffected.
 */
import { computed } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'
import {
  usePreferencesStore,
  EDITOR_SIZE_MIN,
  EDITOR_SIZE_MAX,
  DEFAULT_EDITOR_SIZE
} from '@/stores/preferences'
import { useFontsStore } from '@/stores/fonts'
import { WRITING_FONTS, libraryChoices } from '@/lib/fontChoices'

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
    <button
      class="rounded-md p-1.5 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35"
      title="Smaller writing text"
      :disabled="prefs.editorFontSize <= EDITOR_SIZE_MIN"
      @click="prefs.setEditorFontSize(prefs.editorFontSize - 1)"
    >
      <Minus :size="13" />
    </button>
    <button
      class="w-7 rounded-md py-1 text-center text-[11px] tabular-nums text-ink-dim hover:bg-surface-2 hover:text-ink"
      title="Writing text size — click to reset"
      @click="prefs.setEditorFontSize(DEFAULT_EDITOR_SIZE)"
    >
      {{ prefs.editorFontSize }}
    </button>
    <button
      class="rounded-md p-1.5 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35"
      title="Larger writing text"
      :disabled="prefs.editorFontSize >= EDITOR_SIZE_MAX"
      @click="prefs.setEditorFontSize(prefs.editorFontSize + 1)"
    >
      <Plus :size="13" />
    </button>
  </div>
</template>
