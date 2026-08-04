<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Type, Upload, Trash2, Check } from 'lucide-vue-next'
import { applyScriptFont } from '@/lib/scriptFont'

const font = ref<{ fileName: string; path: string; format: string } | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

async function refresh(): Promise<void> {
  try {
    font.value = await window.cypher.fonts.get()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function importFont(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    const result = await window.cypher.fonts.import()
    if (result) {
      font.value = result
      await applyScriptFont()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function clearFont(): Promise<void> {
  busy.value = true
  try {
    await window.cypher.fonts.clear()
    font.value = null
    await applyScriptFont()
  } finally {
    busy.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Type :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Script font</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Your personal handwriting font, used wherever the diary "translates" a glyph script into
      readable text. Not ready yet? The diary works fine on the placeholder below — drop the real
      file in whenever it's done, no update needed.
    </p>

    <p v-if="error" class="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{{ error }}</p>

    <div v-if="font" class="mb-4 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
      <Check :size="16" class="shrink-0 text-accent" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium">{{ font.fileName }}</div>
        <div class="text-xs text-ink-dim">Active — used across the diary</div>
      </div>
      <span class="font-script shrink-0 text-lg">Aa</span>
    </div>
    <div v-else class="mb-4 rounded-xl border border-dashed border-border bg-surface-2/50 p-3 text-xs text-ink-dim">
      No font installed yet — the diary is using a plain placeholder typeface.
    </div>

    <div class="flex gap-2">
      <button
        class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
        :disabled="busy"
        @click="importFont"
      >
        <Upload :size="15" /> {{ font ? 'Replace font…' : 'Import font…' }}
      </button>
      <button
        v-if="font"
        class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-red-400 disabled:opacity-60"
        :disabled="busy"
        @click="clearFont"
      >
        <Trash2 :size="15" /> Remove
      </button>
    </div>
    <p class="mt-3 text-xs text-ink-dim">Accepts .ttf, .otf, .woff, or .woff2.</p>
  </div>
</template>
