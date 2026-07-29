<script setup lang="ts">
import { ref } from 'vue'
import { FileText, FileType, BookOpen, Loader2, Check, AlertCircle } from 'lucide-vue-next'
import type { ExportFormat } from '@shared/types'

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ close: [] }>()

const format = ref<ExportFormat>('docx')
const titlePage = ref(true)
const volumeHeadings = ref(true)
const includeSynopsis = ref(false)
const busy = ref(false)
const done = ref<string | null>(null)
const error = ref<string | null>(null)

const FORMATS: { key: ExportFormat; label: string; icon: typeof FileText; blurb: string }[] = [
  { key: 'docx', label: 'Word', icon: FileText, blurb: 'Editable .docx for submissions or editors' },
  { key: 'pdf', label: 'PDF', icon: FileType, blurb: 'Fixed layout for reading or printing' },
  { key: 'epub', label: 'EPUB', icon: BookOpen, blurb: 'Reflowable e-book for readers and phones' }
]

async function run(): Promise<void> {
  busy.value = true
  done.value = null
  error.value = null
  try {
    const res = await window.cypher.exporter.book(props.bookId, format.value, {
      titlePage: titlePage.value,
      volumeHeadings: volumeHeadings.value,
      includeSynopsis: includeSynopsis.value
    })
    if (res.cancelled) {
      busy.value = false
      return
    }
    if (res.error) error.value = res.error
    else done.value = `Exported ${res.chapters} chapter(s) to ${res.path}`
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
      <h2 class="mb-1 text-lg font-bold">Export book</h2>
      <p class="mb-4 text-sm text-ink-dim">
        Volumes and chapters are written in the order they appear in your manuscript.
      </p>

      <div class="mb-4 space-y-1">
        <button
          v-for="f in FORMATS"
          :key="f.key"
          class="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors"
          :class="format === f.key ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'"
          @click="format = f.key"
        >
          <component :is="f.icon" :size="18" :class="format === f.key ? 'text-accent' : 'text-ink-dim'" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ f.label }}</span>
            <span class="block text-xs text-ink-dim">{{ f.blurb }}</span>
          </span>
        </button>
      </div>

      <div class="mb-5 space-y-2">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="titlePage" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
          Include a title page
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="volumeHeadings" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
          Include volume headings
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="includeSynopsis" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
          Include chapter synopses
        </label>
      </div>

      <p v-if="done" class="mb-3 flex items-start gap-2 break-all rounded-lg bg-accent-soft px-3 py-2 text-xs">
        <Check :size="14" class="mt-0.5 shrink-0 text-accent" />{{ done }}
      </p>
      <p v-if="error" class="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
        <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
      </p>

      <div class="flex justify-end gap-2">
        <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="emit('close')">
          {{ done ? 'Close' : 'Cancel' }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
          :disabled="busy"
          @click="run"
        >
          <Loader2 v-if="busy" :size="15" class="animate-spin" />
          {{ busy ? 'Exporting…' : 'Export' }}
        </button>
      </div>
    </div>
  </div>
</template>
