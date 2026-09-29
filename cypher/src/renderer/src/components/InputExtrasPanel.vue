<script setup lang="ts">
/**
 * Settings for the wrap-selection shortcut and the mouse side buttons.
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { Keyboard, Mouse, Plus, Trash2, RotateCcw } from 'lucide-vue-next'
import {
  usePreferencesStore,
  DEFAULT_WRAP_SHORTCUT,
  DEFAULT_WRAP_PAIRS,
  type WrapPair,
  type MouseAction,
  type Shortcut
} from '@/stores/preferences'
import { shortcutLabel, mirror } from '@/lib/wrapSelection'
import { MOUSE_ACTION_LABELS } from '@/lib/mouseButtons'

const prefs = usePreferencesStore()

// ----- shortcut recorder -----
const recording = ref(false)
const recordError = ref<string | null>(null)

/** Shortcuts that already mean something and would be lost. */
const RESERVED: { test: (s: Shortcut) => boolean; why: string }[] = [
  { test: (s) => s.ctrl && !s.alt && !s.shift && ['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyA', 'KeyS', 'KeyF', 'KeyB', 'KeyI', 'KeyU', 'KeyE'].includes(s.code), why: 'already used for editing' },
  { test: (s) => s.ctrl && ['Equal', 'Minus', 'Digit0'].includes(s.code) && !s.alt, why: 'used for interface size' },
  { test: (s) => s.ctrl && !s.alt && !s.shift && s.code === 'KeyK', why: 'the command palette' },
  { test: (s) => s.ctrl && s.alt && /^Digit[1-6]$/.test(s.code), why: 'used for headings' },
  { test: (s) => s.ctrl && s.shift && ['Digit7', 'Digit8', 'KeyB', 'KeyX', 'KeyH'].includes(s.code), why: 'used for lists and formatting' },
  { test: (s) => !s.ctrl && !s.alt, why: 'needs Ctrl or Alt, or it would block typing' }
]

function onRecordKey(e: KeyboardEvent): void {
  if (['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    stopRecording()
    return
  }
  const s: Shortcut = { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, code: e.code }
  const clash = RESERVED.find((r) => r.test(s))
  if (clash) {
    recordError.value = `${shortcutLabel(s)} is ${clash.why}. Try another.`
    return
  }
  prefs.setWrapShortcut(s)
  stopRecording()
}

function startRecording(): void {
  recording.value = true
  recordError.value = null
  window.addEventListener('keydown', onRecordKey, true)
}
function stopRecording(): void {
  recording.value = false
  window.removeEventListener('keydown', onRecordKey, true)
}
onBeforeUnmount(stopRecording)

// ----- pairs -----
const pairs = computed(() => prefs.wrapPairs)
const draft = ref<WrapPair>({ trigger: '', open: '', close: '' })
const draftCloseTouched = ref(false)
const draftError = ref<string | null>(null)

function onDraftOpen(value: string): void {
  draft.value.open = value
  if (!draftCloseTouched.value) draft.value.close = mirror(value)
}

function addPair(): void {
  const trigger = [...draft.value.trigger][0] ?? ''
  if (!trigger) {
    draftError.value = 'Pick the character you will type after the shortcut.'
    return
  }
  if (!draft.value.open && !draft.value.close) {
    draftError.value = 'Give it something to wrap with.'
    return
  }
  const others = pairs.value.filter((p) => p.trigger !== trigger)
  prefs.setWrapPairs([...others, { trigger, open: draft.value.open, close: draft.value.close }])
  draft.value = { trigger: '', open: '', close: '' }
  draftCloseTouched.value = false
  draftError.value = null
}

function updatePair(index: number, field: keyof WrapPair, value: string): void {
  const next = pairs.value.map((p) => ({ ...p }))
  next[index][field] = field === 'trigger' ? ([...value][0] ?? '') : value
  prefs.setWrapPairs(next)
}

function removePair(index: number): void {
  prefs.setWrapPairs(pairs.value.filter((_, i) => i !== index))
}

function resetWrap(): void {
  prefs.setWrapShortcut({ ...DEFAULT_WRAP_SHORTCUT })
  prefs.setWrapPairs(DEFAULT_WRAP_PAIRS)
}

// ----- mouse -----
const MOUSE_CHOICES = Object.entries(MOUSE_ACTION_LABELS) as [MouseAction, string][]
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Keyboard :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Wrap selection</h2>
    </div>
    <p class="mb-5 text-sm leading-relaxed text-ink-dim">
      Select text, press
      <kbd class="rounded border border-border px-1 text-xs">{{ shortcutLabel(prefs.wrapShortcut) }}</kbd>,
      then type a character. Characters below use their pair; brackets and curly quotes get their
      matching closer; anything else wraps the text in itself — <code>%</code> gives
      <code>%text%</code>. Press <kbd class="rounded border border-border px-1 text-xs">Enter</kbd>
      instead of a character to type a one-off pair. Works in chapters, lore, documents, the diary
      and notes.
    </p>

    <div class="mb-5 flex flex-wrap items-center gap-2">
      <span class="text-sm font-medium">Shortcut</span>
      <button
        class="rounded-lg border px-3 py-1.5 text-sm tabular-nums"
        :class="recording ? 'border-accent text-accent' : 'border-border hover:border-accent-line'"
        @click="recording ? stopRecording() : startRecording()"
      >
        {{ recording ? 'Press the new shortcut… (Esc to cancel)' : shortcutLabel(prefs.wrapShortcut) }}
      </button>
      <button
        class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-ink-dim hover:text-ink"
        title="Restore the default shortcut and pairs"
        @click="resetWrap"
      >
        <RotateCcw :size="12" /> Defaults
      </button>
      <p v-if="recordError" class="w-full text-xs text-amber-400">{{ recordError }}</p>
    </div>

    <div class="mb-2 grid grid-cols-[3.5rem_1fr_1fr_2rem] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-dim">
      <span>Key</span><span>Before</span><span>After</span><span />
    </div>
    <div class="space-y-1.5">
      <div
        v-for="(p, i) in pairs"
        :key="i"
        class="grid grid-cols-[3.5rem_1fr_1fr_2rem] items-center gap-2"
      >
        <input
          :value="p.trigger"
          maxlength="2"
          class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-center text-sm outline-none focus:border-accent-line"
          @change="updatePair(i, 'trigger', ($event.target as HTMLInputElement).value)"
        />
        <input
          :value="p.open"
          class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
          @change="updatePair(i, 'open', ($event.target as HTMLInputElement).value)"
        />
        <input
          :value="p.close"
          class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
          @change="updatePair(i, 'close', ($event.target as HTMLInputElement).value)"
        />
        <button class="rounded p-1 text-ink-dim hover:text-red-400" title="Remove" @click="removePair(i)">
          <Trash2 :size="14" />
        </button>
      </div>

      <div class="grid grid-cols-[3.5rem_1fr_1fr_2rem] items-center gap-2">
        <input
          v-model="draft.trigger"
          maxlength="2"
          placeholder="key"
          class="rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-center text-sm outline-none focus:border-accent-line"
        />
        <input
          :value="draft.open"
          placeholder="e.g. ⟨⟨"
          class="rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent-line"
          @input="onDraftOpen(($event.target as HTMLInputElement).value)"
          @keydown.enter="addPair"
        />
        <input
          v-model="draft.close"
          placeholder="e.g. ⟩⟩"
          class="rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent-line"
          @input="draftCloseTouched = true"
          @keydown.enter="addPair"
        />
        <button class="rounded p-1 text-ink-dim hover:text-accent" title="Add pair" @click="addPair">
          <Plus :size="15" />
        </button>
      </div>
      <p v-if="draftError" class="text-xs text-amber-400">{{ draftError }}</p>
    </div>

    <div class="mt-8 mb-1 flex items-center gap-2">
      <Mouse :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Mouse buttons</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      The two side buttons on many mice. Whatever you pick acts on the place you're typing, as if you
      had pressed that key.
    </p>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Back button</span>
        <select
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          :value="prefs.mouseBack"
          @change="prefs.setMouseButton('back', ($event.target as HTMLSelectElement).value as MouseAction)"
        >
          <option v-for="[value, label] in MOUSE_CHOICES" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Forward button</span>
        <select
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          :value="prefs.mouseForward"
          @change="prefs.setMouseButton('forward', ($event.target as HTMLSelectElement).value as MouseAction)"
        >
          <option v-for="[value, label] in MOUSE_CHOICES" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
    </div>
  </div>
</template>
