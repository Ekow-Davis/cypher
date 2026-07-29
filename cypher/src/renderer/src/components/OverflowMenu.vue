<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { MoreHorizontal } from 'lucide-vue-next'

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onDocumentMouseDown(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="relative shrink-0">
    <button
      class="flex items-center justify-center rounded-lg border border-border p-1.5 transition-colors"
      :class="open ? 'text-accent' : 'text-ink-dim hover:text-ink'"
      title="More actions"
      @click="open = !open"
    >
      <MoreHorizontal :size="16" />
    </button>

    <!-- Items are plain buttons supplied by the parent; clicking anywhere in
         the panel closes it, so each item needs no dismissal logic. -->
    <div
      v-if="open"
      class="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-xl"
      @click="open = false"
    >
      <slot />
    </div>
  </div>
</template>
