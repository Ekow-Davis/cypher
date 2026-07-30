<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { X, Loader2, Printer, AlertCircle } from 'lucide-vue-next'

/* eslint-disable @typescript-eslint/no-explicit-any */
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ docId: number }>()
const emit = defineEmits<{ close: [] }>()

const host = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const pages = ref(0)
let pdf: any = null

/**
 * The preview is the actual print output: main renders the document through the
 * same pipeline the printer uses and hands back a PDF, which is drawn here.
 * Anything else would be a second layout engine free to disagree with the first.
 */
async function build(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const buf = await window.cypher.printer.previewDocument(props.docId)
    if (!buf) {
      error.value = 'Could not build a preview.'
      return
    }
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
    pages.value = pdf.numPages
    const container = host.value
    if (!container) return
    container.replaceChildren()

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: 1.35 })
      const canvas = document.createElement('canvas')
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      canvas.className = 'mb-4 rounded-sm bg-white shadow-lg'
      container.appendChild(canvas)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      await page.render({ canvasContext: ctx, viewport }).promise
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function printNow(): Promise<void> {
  await window.cypher.printer.document(props.docId)
}

onMounted(build)
onBeforeUnmount(() => {
  try {
    pdf?.destroy?.()
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-black/70" @click.self="emit('close')">
    <div class="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
      <h2 class="text-sm font-semibold">Print preview</h2>
      <span v-if="pages" class="text-xs text-ink-dim">{{ pages }} page{{ pages === 1 ? '' : 's' }}</span>
      <button
        class="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent"
        @click="printNow"
      >
        <Printer :size="15" /> Print
      </button>
      <button class="rounded-lg p-1.5 text-ink-dim hover:text-ink" title="Close" @click="emit('close')">
        <X :size="16" />
      </button>
    </div>

    <div class="relative flex-1 overflow-auto bg-surface-2/60 p-6">
      <div ref="host" class="flex flex-col items-center" />
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-ink-dim">
        <Loader2 :size="24" class="animate-spin" />
      </div>
      <p
        v-else-if="error"
        class="absolute inset-0 flex items-center justify-center gap-2 p-6 text-center text-sm text-red-400"
      >
        <AlertCircle :size="16" /> {{ error }}
      </p>
    </div>
  </div>
</template>
