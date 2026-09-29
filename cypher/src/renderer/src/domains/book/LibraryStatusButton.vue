<script setup lang="ts">
/**
 * Where a lore entry stands with the shared library, and the one-click
 * actions that follow: add it, or — when this copy and the library's have
 * drifted apart — send this version up or bring the library's down.
 */
import { ref, computed, onMounted } from 'vue'
import { LibraryBig, Check, ArrowUpFromLine, ArrowDownToLine, Loader2 } from 'lucide-vue-next'
import { useLibraryStore } from '@/stores/library'
import { useLoreStore } from '@/stores/lore'
import type { LoreEntry } from '@shared/types'

const props = defineProps<{ entry: LoreEntry; beforePush?: () => Promise<void> }>()
const library = useLibraryStore()
const lore = useLoreStore()
const open = ref(false)
const busy = ref(false)

onMounted(() => {
  if (!library.loaded) void library.load()
})

const state = computed(() => (library.loaded ? library.stateOf(props.entry) : 'none'))

async function push(): Promise<void> {
  busy.value = true
  try {
    // Unsaved typing must reach the database before it is copied.
    await props.beforePush?.()
    const fresh = lore.entries.find((e) => e.id === props.entry.id) ?? props.entry
    await library.push([fresh])
  } finally {
    busy.value = false
    open.value = false
  }
}

async function pull(): Promise<void> {
  if (!props.entry.library_id || lore.bookId == null) return
  busy.value = true
  try {
    await library.importInto(lore.bookId, [props.entry.library_id], null)
  } finally {
    busy.value = false
    open.value = false
  }
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-surface-2"
      :class="state === 'differs' ? 'text-amber-400' : state === 'same' ? 'text-accent' : 'text-ink-dim hover:text-ink'"
      :title="
        state === 'none' || state === 'missing'
          ? 'Copy this entry to the shared library so other books can use it'
          : state === 'same'
            ? 'This entry matches its copy in the library'
            : 'This entry and its library copy differ'
      "
      :disabled="busy"
      @click="state === 'none' || state === 'missing' ? push() : (open = !open)"
    >
      <Loader2 v-if="busy" :size="13" class="animate-spin" />
      <LibraryBig v-else :size="13" />
      <template v-if="state === 'none' || state === 'missing'">Add to library</template>
      <template v-else-if="state === 'same'">In library <Check :size="11" /></template>
      <template v-else>Library differs</template>
    </button>
    <div
      v-if="open && (state === 'same' || state === 'differs')"
      class="absolute left-0 top-full z-40 mt-1 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
    >
      <p v-if="state === 'same'" class="px-2 py-1.5 text-xs text-ink-dim">
        Up to date with the library. Changes you make here stay in this book until you send them.
      </p>
      <p v-else class="px-2 py-1.5 text-xs text-ink-dim">
        This book's copy and the library's have changed separately. Which should win?
      </p>
      <button
        v-if="state === 'differs'"
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
        @click="push"
      >
        <ArrowUpFromLine :size="14" class="text-accent" /> Send this version to the library
      </button>
      <button
        v-if="state === 'differs'"
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
        @click="pull"
      >
        <ArrowDownToLine :size="14" class="text-accent" /> Replace with the library's version
      </button>
    </div>
  </div>
</template>
