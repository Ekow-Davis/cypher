<script setup lang="ts">
/**
 * Settings for text expansion, autocorrect and the scene-break ornament.
 */
import { ref, computed } from 'vue'
import { Replace, Plus, Trash2, Sparkles } from 'lucide-vue-next'
import { usePreferencesStore, type TextRule } from '@/stores/preferences'
import { SUGGESTED_RULES } from '@/lib/textRules'

const prefs = usePreferencesStore()

const draft = ref<TextRule>({ from: '', to: '', kind: 'expand' })
const error = ref<string | null>(null)
const GLYPHS = ['* * *', '⁂', '#', '~', '◆ ◆ ◆', '— — —', '§']
const customGlyph = ref(GLYPHS.includes(prefs.sceneBreakGlyph) ? '' : prefs.sceneBreakGlyph)

const rules = computed(() => prefs.textRules)
const missingSuggestions = computed(() =>
  SUGGESTED_RULES.filter((s) => !rules.value.some((r) => r.from.toLowerCase() === s.from.toLowerCase()))
)

function add(): void {
  const from = draft.value.from.trim()
  if (!from) {
    error.value = 'Type what you will write — the shortcut or the misspelling.'
    return
  }
  if (/\s/.test(from)) {
    error.value = 'The typed part is a single word or shortcut, without spaces.'
    return
  }
  if (!draft.value.to) {
    error.value = 'Say what it should become.'
    return
  }
  const others = rules.value.filter((r) => r.from.toLowerCase() !== from.toLowerCase())
  prefs.setTextRules([...others, { from, to: draft.value.to, kind: draft.value.kind }])
  draft.value = { from: '', to: '', kind: draft.value.kind }
  error.value = null
}

function update(i: number, patch: Partial<TextRule>): void {
  const next = rules.value.map((r) => ({ ...r }))
  next[i] = { ...next[i], ...patch }
  if (!next[i].from.trim()) return
  prefs.setTextRules(next)
}

function remove(i: number): void {
  prefs.setTextRules(rules.value.filter((_, j) => j !== i))
}

function addSuggested(): void {
  prefs.setTextRules([...rules.value, ...missingSuggestions.value])
}

function pickGlyph(g: string): void {
  customGlyph.value = ''
  prefs.setSceneBreakGlyph(g)
}
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Replace :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Text expansion &amp; autocorrect</h2>
    </div>
    <p class="mb-4 text-sm leading-relaxed text-ink-dim">
      Replacements happen when you finish a word — a space, punctuation or Enter — never mid-word.
      Press <kbd class="rounded border border-border px-1 text-xs">Backspace</kbd> straight after to
      put back what you typed. <strong>Expand</strong> matches exactly (<code>;cc</code> → a long
      name); <strong>Correct</strong> ignores capitals and keeps them (<code>Teh</code> → The).
    </p>

    <label class="mb-4 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        class="h-4 w-4"
        style="accent-color: var(--color-accent)"
        :checked="prefs.textRulesOn"
        @change="prefs.setTextRulesOn(($event.target as HTMLInputElement).checked)"
      />
      Use my replacements while writing
    </label>

    <div class="mb-2 grid grid-cols-[1fr_1.4fr_6.5rem_2rem] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-dim">
      <span>You type</span><span>It becomes</span><span>Kind</span><span />
    </div>
    <div class="space-y-1.5" :class="prefs.textRulesOn ? '' : 'opacity-60'">
      <div v-for="(r, i) in rules" :key="`${r.from}-${i}`" class="grid grid-cols-[1fr_1.4fr_6.5rem_2rem] items-center gap-2">
        <input
          :value="r.from"
          class="rounded-lg border border-border bg-surface-2 px-2 py-1 font-mono text-sm outline-none focus:border-accent-line"
          @change="update(i, { from: ($event.target as HTMLInputElement).value.trim() })"
        />
        <input
          :value="r.to"
          class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
          @change="update(i, { to: ($event.target as HTMLInputElement).value })"
        />
        <select
          :value="r.kind"
          class="rounded-lg border border-border bg-surface-2 px-1.5 py-1 text-xs outline-none"
          @change="update(i, { kind: ($event.target as HTMLSelectElement).value as TextRule['kind'] })"
        >
          <option value="expand">Expand</option>
          <option value="correct">Correct</option>
        </select>
        <button class="rounded p-1 text-ink-dim hover:text-red-400" title="Remove" @click="remove(i)">
          <Trash2 :size="14" />
        </button>
      </div>

      <div class="grid grid-cols-[1fr_1.4fr_6.5rem_2rem] items-center gap-2">
        <input
          v-model="draft.from"
          placeholder=";cc"
          class="rounded-lg border border-dashed border-border bg-transparent px-2 py-1 font-mono text-sm outline-none focus:border-accent-line"
          @keydown.enter="add"
        />
        <input
          v-model="draft.to"
          placeholder="The Crimson Chapel"
          class="rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent-line"
          @keydown.enter="add"
        />
        <select v-model="draft.kind" class="rounded-lg border border-dashed border-border bg-transparent px-1.5 py-1 text-xs outline-none">
          <option value="expand">Expand</option>
          <option value="correct">Correct</option>
        </select>
        <button class="rounded p-1 text-ink-dim hover:text-accent" title="Add" @click="add">
          <Plus :size="15" />
        </button>
      </div>
      <p v-if="error" class="text-xs text-amber-400">{{ error }}</p>
    </div>

    <button
      v-if="missingSuggestions.length"
      class="mt-3 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink-dim hover:text-ink"
      :title="missingSuggestions.map((s) => `${s.from} → ${s.to}`).join('\n')"
      @click="addSuggested"
    >
      <Sparkles :size="13" /> Add {{ missingSuggestions.length }} common fixes (teh → the, -- → —, … )
    </button>

    <div class="mt-8">
      <div class="mb-1 text-sm font-medium">Scene break</div>
      <p class="mb-2 text-xs text-ink-dim">
        What the ⁂ button in the chapter toolbar inserts. Typing asterisks yourself is never
        converted — only the button makes a scene break.
      </p>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="g in GLYPHS"
          :key="g"
          class="rounded-lg border px-3 py-1 text-sm tracking-widest"
          :class="prefs.sceneBreakGlyph === g && !customGlyph ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          @click="pickGlyph(g)"
        >
          {{ g }}
        </button>
        <input
          v-model="customGlyph"
          placeholder="Your own…"
          class="w-28 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
          @change="customGlyph.trim() && prefs.setSceneBreakGlyph(customGlyph)"
        />
      </div>
    </div>
  </div>
</template>
