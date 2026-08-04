<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Type, Upload, Trash2, Check, Plus, Pencil } from 'lucide-vue-next'
import { applyScriptFont } from '@/lib/scriptFont'
import { useFontsStore } from '@/stores/fonts'
import { usePreferencesStore } from '@/stores/preferences'

const fonts = useFontsStore()
const prefs = usePreferencesStore()
const renaming = ref<string | null>(null)
const renameDraft = ref('')

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

async function addLibraryFont(): Promise<void> {
  busy.value = true
  try {
    await fonts.add()
  } finally {
    busy.value = false
  }
}

function startRename(id: string, current: string): void {
  renaming.value = id
  renameDraft.value = current
}
async function commitRename(): Promise<void> {
  if (renaming.value && renameDraft.value.trim()) {
    await fonts.rename(renaming.value, renameDraft.value.trim())
  }
  renaming.value = null
}

onMounted(async () => {
  await refresh()
  if (!fonts.loaded) await fonts.load()
})
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

    <!-- font library -->
    <div class="mt-6 border-t border-border pt-5">
      <div class="mb-1 flex items-center gap-2">
        <Type :size="16" class="text-accent" />
        <h3 class="text-sm font-semibold">Your fonts</h3>
      </div>
      <p class="mb-3 text-xs text-ink-dim">
        Fonts you add here appear in the Document font menu and can be chosen as your writing font
        below.
      </p>

      <div v-if="fonts.library.length" class="mb-3 space-y-1">
        <div
          v-for="f in fonts.library"
          :key="f.id"
          class="group flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5"
        >
          <input
            v-if="renaming === f.id"
            v-model="renameDraft"
            class="min-w-0 flex-1 rounded border border-accent-line bg-surface px-1.5 py-0.5 text-sm outline-none"
            @keydown.enter="commitRename"
            @blur="commitRename"
          />
          <span v-else class="min-w-0 flex-1 truncate text-sm" :style="{ fontFamily: `'${f.family}'` }">
            {{ f.family }}
          </span>
          <span class="shrink-0 text-lg" :style="{ fontFamily: `'${f.family}'` }">Aa</span>
          <button
            class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
            title="Rename"
            @click="startRename(f.id, f.family)"
          >
            <Pencil :size="12" />
          </button>
          <button
            class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            title="Remove"
            @click="fonts.remove(f.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
      <p v-else class="mb-3 rounded-xl border border-dashed border-border bg-surface-2/50 p-3 text-xs text-ink-dim">
        No extra fonts yet.
      </p>

      <button
        class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink disabled:opacity-60"
        :disabled="busy"
        @click="addLibraryFont"
      >
        <Plus :size="15" /> Add fonts…
      </button>

      <div class="mt-5">
        <div class="mb-1 text-sm font-medium">Writing font</div>
        <p class="mb-2 text-xs text-ink-dim">Used by the manuscript and lore editors.</p>
        <select
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          :value="prefs.editorFont"
          @change="prefs.setEditorFont(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Default (Georgia)</option>
          <option value="system-ui, -apple-system, sans-serif">System sans</option>
          <option value="'Courier New', Courier, monospace">Monospace</option>
          <option v-for="f in fonts.library" :key="f.id" :value="`'${f.family}'`">
            {{ f.family }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
