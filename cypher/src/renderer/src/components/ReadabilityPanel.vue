<script setup lang="ts">
/**
 * Text size and font for the whole app, for comfort and accessibility.
 *
 * Interface scale enlarges everything — sidebars, menus, buttons — the way a
 * browser's zoom does. Writing size only affects the manuscript and lore
 * editors, for when the chrome is fine but the prose wants to be bigger.
 */
import { computed } from 'vue'
import { Type } from 'lucide-vue-next'
import {
  usePreferencesStore,
  UI_SCALES,
  EDITOR_SIZE_MIN,
  EDITOR_SIZE_MAX,
  DEFAULT_EDITOR_SIZE
} from '@/stores/preferences'
import { useFontsStore } from '@/stores/fonts'
import { UI_FONTS, WRITING_FONTS, libraryChoices } from '@/lib/fontChoices'

const prefs = usePreferencesStore()
const fonts = useFontsStore()

const uiChoices = computed(() => [...UI_FONTS, ...libraryChoices(fonts.library)])
const writingChoices = computed(() => [...WRITING_FONTS, ...libraryChoices(fonts.library)])

function pct(scale: number): string {
  return `${Math.round(scale * 100)}%`
}
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Type :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Text &amp; readability</h2>
    </div>
    <p class="mb-6 text-sm text-ink-dim">
      Make Cypher easier to read. <kbd class="rounded border border-border px-1 text-xs">Ctrl +</kbd>
      and <kbd class="rounded border border-border px-1 text-xs">Ctrl −</kbd> change the interface
      size from anywhere; <kbd class="rounded border border-border px-1 text-xs">Ctrl 0</kbd> resets it.
    </p>

    <div class="mb-5">
      <div class="mb-1 text-sm font-medium">Interface size</div>
      <p class="mb-2 text-xs text-ink-dim">Scales everything: menus, sidebars, buttons and text.</p>
      <div class="grid grid-cols-3 gap-1 sm:grid-cols-6">
        <button
          v-for="s in UI_SCALES"
          :key="s"
          class="rounded-lg border px-2 py-1.5 text-xs tabular-nums"
          :class="Math.abs(prefs.uiScale - s) < 0.001 ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          @click="prefs.setUiScale(s)"
        >
          {{ pct(s) }}
        </button>
      </div>
    </div>

    <div class="mb-5">
      <div class="mb-1 text-sm font-medium">Interface font</div>
      <select
        class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        :value="prefs.uiFont"
        @change="prefs.setUiFont(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in uiChoices" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </div>

    <div class="mb-5">
      <div class="mb-1 flex items-baseline justify-between text-sm font-medium">
        <span>Writing text size</span>
        <span class="text-xs tabular-nums text-ink-dim">{{ prefs.editorFontSize }}px</span>
      </div>
      <p class="mb-2 text-xs text-ink-dim">
        The manuscript and lore editors. Also adjustable from the chapter toolbar. Display only —
        exports keep their own sizes.
      </p>
      <div class="flex items-center gap-3">
        <input
          type="range"
          class="flex-1"
          style="accent-color: var(--color-accent)"
          :min="EDITOR_SIZE_MIN"
          :max="EDITOR_SIZE_MAX"
          :value="prefs.editorFontSize"
          @input="prefs.setEditorFontSize(Number(($event.target as HTMLInputElement).value))"
        />
        <button
          class="rounded-lg border border-border px-2 py-1 text-xs text-ink-dim hover:text-ink"
          @click="prefs.setEditorFontSize(DEFAULT_EDITOR_SIZE)"
        >
          Reset
        </button>
      </div>
      <p
        class="mt-3 rounded-xl border border-border bg-surface-2 px-4 py-3 leading-relaxed"
        :style="{ fontFamily: 'var(--font-editor)', fontSize: prefs.editorFontSize + 'px' }"
      >
        The chapel bell rang twice, and the fog came in off the water.
      </p>
    </div>

    <div>
      <div class="mb-1 text-sm font-medium">Writing font</div>
      <select
        class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        :value="prefs.editorFont"
        @change="prefs.setEditorFont(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in writingChoices" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </div>
  </div>
</template>
