<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

/**
 * A replacement for window.prompt, which Electron disables in renderer windows
 * — it returns null without showing anything, so every feature that used it
 * failed silently.
 */
const props = defineProps<{
  open: boolean
  title: string
  value?: string
  placeholder?: string
  multiline?: boolean
  confirmLabel?: string
}>()
const emit = defineEmits<{ submit: [value: string]; cancel: [] }>()

const draft = ref('')
const field = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    draft.value = props.value ?? ''
    void nextTick(() => {
      field.value?.focus()
      field.value?.select?.()
    })
  },
  { immediate: true }
)

function submit(): void {
  emit('submit', draft.value)
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    @click.self="emit('cancel')"
  >
    <div class="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
      <h2 class="mb-3 text-base font-semibold">{{ title }}</h2>

      <textarea
        v-if="multiline"
        ref="field"
        v-model="draft"
        rows="4"
        :placeholder="placeholder"
        class="w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        @keydown.esc="emit('cancel')"
        @keydown.ctrl.enter="submit"
      />
      <input
        v-else
        ref="field"
        v-model="draft"
        :placeholder="placeholder"
        class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        @keydown.esc="emit('cancel')"
        @keydown.enter="submit"
      />

      <div class="mt-4 flex justify-end gap-2">
        <button
          class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
          @click="submit"
        >
          {{ confirmLabel ?? 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>
