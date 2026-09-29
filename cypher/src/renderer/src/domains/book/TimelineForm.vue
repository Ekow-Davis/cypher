<script setup lang="ts">
/**
 * Edits one dated thing: when it starts, optionally when it ends, how the date
 * reads in-world, and a note. Shared by the timeline itself and the small
 * "When" fields on chapters, entries and characters.
 */
import { ref, computed } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import type { TimelineItem, TimelineKind } from '@shared/types'

const props = defineProps<{
  kind: TimelineKind
  refId: number | null
  item: TimelineItem | null
  /** Where a brand-new item starts, e.g. the middle of the visible timeline. */
  suggestedStart?: number
}>()
const emit = defineEmits<{ done: [TimelineItem | null]; cancel: [] }>()

const timeline = useTimelineStore()

const title = ref(props.item?.title ?? '')
const start = ref<string>(props.item ? String(props.item.start_at) : props.suggestedStart != null ? String(props.suggestedStart) : '')
const end = ref<string>(props.item?.end_at != null ? String(props.item.end_at) : '')
const label = ref(props.item?.label ?? '')
const note = ref(props.item?.note ?? '')
const error = ref<string | null>(null)
const busy = ref(false)

const words = computed(() => {
  switch (props.kind) {
    case 'character':
      return { start: 'Born', end: 'Died (optional)', hint: 'Leave "died" empty if they live through the story.' }
    case 'lore':
      return { start: 'Begins', end: 'Ends (optional)', hint: 'When a place is founded, an order formed, a war fought.' }
    case 'chapter':
      return { start: 'Takes place', end: 'Until (optional)', hint: 'For a chapter spanning days or years, set both.' }
    default:
      return { start: 'Starts', end: 'Ends (optional)', hint: '' }
  }
})

async function save(): Promise<void> {
  error.value = null
  const s = Number(start.value)
  if (start.value.trim() === '' || !Number.isFinite(s)) {
    error.value = `${words.value.start} needs a number on your timeline's scale.`
    return
  }
  const e = end.value.trim() === '' ? null : Number(end.value)
  if (e !== null && !Number.isFinite(e)) {
    error.value = 'The end needs to be a number, or empty.'
    return
  }
  if (e !== null && e < s) {
    error.value = 'The end comes before the start.'
    return
  }
  if (props.kind === 'event' && !title.value.trim()) {
    error.value = 'Give the event a name.'
    return
  }
  busy.value = true
  try {
    const saved = await timeline.save({
      id: props.item?.id,
      kind: props.kind,
      refId: props.refId,
      title: title.value.trim(),
      start_at: s,
      end_at: e,
      label: label.value.trim(),
      note: note.value.trim()
    })
    emit('done', saved)
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.item) return
  await timeline.remove(props.item.id)
  emit('done', null)
}
</script>

<template>
  <form class="space-y-2.5" @submit.prevent="save" @keydown.esc.stop="emit('cancel')">
    <label v-if="kind === 'event'" class="block">
      <span class="mb-0.5 block text-[11px] text-ink-dim">Event</span>
      <input
        v-model="title"
        placeholder="The Fall of Vell"
        class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
      />
    </label>
    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="mb-0.5 block text-[11px] text-ink-dim">{{ words.start }}</span>
        <input
          v-model="start"
          inputmode="decimal"
          :placeholder="timeline.scale.unit"
          class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm tabular-nums outline-none focus:border-accent-line"
        />
      </label>
      <label class="block">
        <span class="mb-0.5 block text-[11px] text-ink-dim">{{ words.end }}</span>
        <input
          v-model="end"
          inputmode="decimal"
          class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm tabular-nums outline-none focus:border-accent-line"
        />
      </label>
    </div>
    <label class="block">
      <span class="mb-0.5 block text-[11px] text-ink-dim">Reads as (optional)</span>
      <input
        v-model="label"
        placeholder="Spring, 312 AE"
        class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
      />
    </label>
    <label class="block">
      <span class="mb-0.5 block text-[11px] text-ink-dim">Note (optional)</span>
      <textarea
        v-model="note"
        rows="2"
        class="w-full resize-y rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
      />
    </label>
    <p v-if="words.hint" class="text-[11px] text-ink-dim">
      {{ words.hint }} Numbers are on your book's scale ({{ timeline.formatTime(312) }}); decimals
      work for months or days.
    </p>
    <p v-if="error" class="text-[11px] text-amber-400">{{ error }}</p>
    <div class="flex items-center gap-2 pt-1">
      <button
        v-if="item"
        type="button"
        class="text-xs text-ink-dim hover:text-red-400"
        @click="remove"
      >
        {{ kind === 'event' ? 'Delete event' : 'Remove date' }}
      </button>
      <span class="flex-1" />
      <button type="button" class="rounded-lg px-2.5 py-1 text-xs text-ink-dim hover:text-ink" @click="emit('cancel')">
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-on-accent disabled:opacity-50"
        :disabled="busy"
      >
        Save
      </button>
    </div>
  </form>
</template>
