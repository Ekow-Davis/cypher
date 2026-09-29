<script setup lang="ts">
/**
 * The small prompt shown after the wrap shortcut: which characters are set
 * up, and — after Enter — a form for a one-off pair.
 */
import { ref, watch, nextTick } from 'vue'
import { wrapUi, applyWrap, cancelWrap, startCustomWrap, mirror, pairFor } from '@/lib/wrapSelection'
import { usePreferencesStore } from '@/stores/preferences'

const prefs = usePreferencesStore()

const open = ref('')
const close = ref('')
/** Until the closing half is edited by hand, it follows the opening one. */
const closeTouched = ref(false)
const openInput = ref<HTMLInputElement | null>(null)

watch(
  () => wrapUi.custom,
  async (on) => {
    if (!on) return
    open.value = ''
    close.value = ''
    closeTouched.value = false
    await nextTick()
    openInput.value?.focus()
  }
)

watch(open, (value) => {
  if (!closeTouched.value) close.value = mirror(value)
})

function submit(): void {
  applyWrap(open.value, close.value)
}

function pick(trigger: string): void {
  const p = pairFor(trigger, prefs.wrapPairs)
  applyWrap(p.open, p.close)
}
</script>

<template>
  <div
    v-if="wrapUi.armed || wrapUi.custom"
    data-wrap-hint
    class="fixed z-[90] max-w-[18rem] rounded-xl border border-border bg-surface p-2 text-xs shadow-xl"
    :style="{ left: wrapUi.x + 'px', top: wrapUi.y + 'px' }"
  >
    <template v-if="wrapUi.armed">
      <p class="px-1 text-ink-dim">
        <span class="font-semibold text-ink">Wrap with…</span> type a character ·
        <kbd class="rounded border border-border px-1">Enter</kbd> custom ·
        <kbd class="rounded border border-border px-1">Esc</kbd>
      </p>
      <div v-if="prefs.wrapPairs.length" class="mt-1.5 flex flex-wrap gap-1">
        <button
          v-for="p in prefs.wrapPairs"
          :key="p.trigger"
          class="rounded-md border border-border px-1.5 py-0.5 hover:border-accent-line hover:text-accent"
          :title="`Press ${p.trigger}`"
          @mousedown.prevent
          @click="pick(p.trigger)"
        >
          <span class="text-ink-dim">{{ p.trigger }}</span>
          <span class="ml-1 font-medium">{{ p.open }}…{{ p.close }}</span>
        </button>
        <button
          class="rounded-md border border-dashed border-border px-1.5 py-0.5 text-ink-dim hover:text-ink"
          @mousedown.prevent
          @click="startCustomWrap()"
        >
          Custom…
        </button>
      </div>
    </template>

    <form v-else class="flex items-center gap-1" @submit.prevent="submit" @keydown.esc.prevent="cancelWrap()">
      <input
        ref="openInput"
        v-model="open"
        placeholder="Before"
        class="w-20 rounded-md border border-border bg-surface-2 px-1.5 py-1 outline-none focus:border-accent-line"
      />
      <span class="text-ink-dim">…</span>
      <input
        v-model="close"
        placeholder="After"
        class="w-20 rounded-md border border-border bg-surface-2 px-1.5 py-1 outline-none focus:border-accent-line"
        @input="closeTouched = true"
      />
      <button type="submit" class="rounded-md bg-accent px-2 py-1 font-semibold text-on-accent">Wrap</button>
    </form>
  </div>
</template>
