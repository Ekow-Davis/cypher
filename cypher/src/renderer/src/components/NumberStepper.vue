<script setup lang="ts">
/**
 * A compact − [value] + control. The value can be typed (Enter or leaving the
 * box applies it), stepped with the buttons, or stepped with the Up/Down arrow
 * keys while the box has focus — Shift steps five times as far.
 *
 * With `zeroLabel`, 0 is a special value (e.g. "Fill"): it shows that label,
 * typing the label or 0 selects it, and stepping down from it lands on `max`.
 */
import { computed, ref, watch } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min: number
    max: number
    step?: number
    /** Decimal places kept when typing, e.g. 2 for inches. */
    decimals?: number
    unit?: string
    zeroLabel?: string
    title?: string
    /** Tailwind width class for the number box. */
    boxClass?: string
  }>(),
  { step: 1, decimals: 0, unit: '', zeroLabel: '', title: '', boxClass: 'w-10' }
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const allowZero = computed(() => !!props.zeroLabel)
const isZero = computed(() => allowZero.value && props.modelValue === 0)

function display(v: number): string {
  if (allowZero.value && v === 0) return props.zeroLabel
  return props.decimals ? v.toFixed(props.decimals).replace(/\.?0+$/, '') : String(v)
}

const draft = ref(display(props.modelValue))
const editing = ref(false)
watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) draft.value = display(v)
  }
)

function clamp(v: number): number {
  const f = 10 ** props.decimals
  return Math.round(Math.min(props.max, Math.max(props.min, v)) * f) / f
}

function set(v: number): void {
  const next = allowZero.value && v === 0 ? 0 : clamp(v)
  draft.value = display(next)
  if (next !== props.modelValue) emit('update:modelValue', next)
}

function commit(): void {
  editing.value = false
  const raw = draft.value.trim().toLowerCase()
  if (allowZero.value && (raw === props.zeroLabel.toLowerCase() || raw === '0')) return set(0)
  const n = Number.parseFloat(raw.replace(',', '.'))
  if (Number.isFinite(n)) set(n)
  else draft.value = display(props.modelValue)
}

function stepBy(dir: 1 | -1, times = 1): void {
  if (isZero.value) {
    // From "Fill" (or whatever 0 means) only stepping down makes sense.
    if (dir === -1) set(props.max)
    return
  }
  // Stepping up past the top lands on the special value ("Fill").
  if (allowZero.value && dir === 1 && props.modelValue >= props.max) return set(0)
  set(props.modelValue + dir * props.step * times)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    commit()
    ;(e.target as HTMLInputElement).blur()
  } else if (e.key === 'Escape') {
    editing.value = false
    draft.value = display(props.modelValue)
    ;(e.target as HTMLInputElement).blur()
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    commit()
    stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 5 : 1)
    editing.value = true
  }
}

const atMin = computed(() => !isZero.value && props.modelValue <= props.min)
const atMax = computed(() => isZero.value || (!allowZero.value && props.modelValue >= props.max))
</script>

<template>
  <div class="flex items-center gap-0.5" :title="title">
    <button
      type="button"
      class="rounded-md p-1.5 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35"
      :disabled="atMin"
      :title="`Decrease${title ? ' ' + title.toLowerCase() : ''}`"
      @click="stepBy(-1)"
    >
      <Minus :size="13" />
    </button>
    <div
      class="flex items-center rounded-md border border-transparent px-0.5 hover:border-border focus-within:border-accent-line"
    >
      <input
        v-model="draft"
        type="text"
        inputmode="decimal"
        spellcheck="false"
        class="bg-transparent py-1 text-center text-[11px] tabular-nums text-ink-dim outline-none focus:text-ink"
        :class="boxClass"
        @focus="editing = true; ($event.target as HTMLInputElement).select()"
        @blur="commit"
        @keydown="onKey"
      />
      <span v-if="unit && !isZero" class="pr-0.5 text-[10px] text-ink-dim">{{ unit }}</span>
    </div>
    <button
      type="button"
      class="rounded-md p-1.5 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35"
      :disabled="atMax"
      :title="`Increase${title ? ' ' + title.toLowerCase() : ''}`"
      @click="stepBy(1)"
    >
      <Plus :size="13" />
    </button>
  </div>
</template>
