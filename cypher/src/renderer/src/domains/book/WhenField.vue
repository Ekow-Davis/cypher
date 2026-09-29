<script setup lang="ts">
/**
 * A compact "when" control for a chapter, lore entry or character: shows the
 * in-world date if set, and opens the timeline editor in a popover.
 */
import { ref, computed } from 'vue'
import { CalendarRange } from 'lucide-vue-next'
import { useTimelineStore } from '@/stores/timeline'
import TimelineForm from './TimelineForm.vue'
import type { TimelineKind } from '@shared/types'

const props = defineProps<{ kind: Exclude<TimelineKind, 'event'>; refId: number }>()
const timeline = useTimelineStore()
const open = ref(false)

const item = computed(() => timeline.byRef.get(`${props.kind}:${props.refId}`) ?? null)
const emptyText = computed(() =>
  props.kind === 'character' ? 'Set lifespan' : props.kind === 'chapter' ? 'Set when this happens' : 'Set a date'
)
</script>

<template>
  <div class="relative inline-block">
    <button
      class="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors"
      :class="item ? 'border-accent-line text-ink' : 'border-dashed border-border text-ink-dim hover:text-ink'"
      :title="item?.note || 'Place this on the book\'s timeline'"
      @click="open = !open"
    >
      <CalendarRange :size="12" :class="item ? 'text-accent' : ''" />
      {{ item ? timeline.describe(item) : emptyText }}
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-border bg-surface p-3 shadow-xl"
    >
      <TimelineForm
        :kind="kind"
        :ref-id="refId"
        :item="item"
        @done="open = false"
        @cancel="open = false"
      />
    </div>
  </div>
</template>
