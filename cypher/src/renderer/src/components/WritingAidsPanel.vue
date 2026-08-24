<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SpellCheck, BookA, Plus, X, Globe, ChevronDown } from 'lucide-vue-next'

const spellEnabled = ref(true)
const languages = ref<{ current: string[]; available: string[] }>({ current: [], available: [] })
const words = ref<string[]>([])
const newWord = ref('')
const thesaurusOn = ref(false)
const showAllLanguages = ref(false)

/** The two spellings a novelist actually chooses between, front and centre. */
const COMMON = [
  { code: 'en-US', label: 'American English' },
  { code: 'en-GB', label: 'British English' }
]
const activeLanguage = computed(() => languages.value.current[0] ?? 'en-US')
/** Anything beyond the two common ones — offered, not hidden away entirely. */
const otherLanguages = computed(() =>
  languages.value.available.filter((code) => !COMMON.some((c) => c.code === code))
)

async function load(): Promise<void> {
  spellEnabled.value = await window.cypher.spell.enabled()
  languages.value = await window.cypher.spell.languages()
  words.value = await window.cypher.spell.words()
  const all = await window.cypher.settings.getAll()
  thesaurusOn.value = all.thesaurusEnabled === true
}

async function toggleSpell(): Promise<void> {
  spellEnabled.value = !spellEnabled.value
  await window.cypher.spell.setEnabled(spellEnabled.value)
}

async function setLanguage(code: string): Promise<void> {
  await window.cypher.spell.setLanguages([code])
  languages.value = await window.cypher.spell.languages()
}

async function addWord(): Promise<void> {
  const word = newWord.value.trim()
  if (!word) return
  await window.cypher.spell.addWord(word)
  newWord.value = ''
  words.value = await window.cypher.spell.words()
}

async function removeWord(word: string): Promise<void> {
  await window.cypher.spell.removeWord(word)
  words.value = await window.cypher.spell.words()
}

async function toggleThesaurus(): Promise<void> {
  thesaurusOn.value = !thesaurusOn.value
  await window.cypher.settings.set('thesaurusEnabled', thesaurusOn.value)
}

onMounted(load)
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <SpellCheck :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Spelling</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Works everywhere you type — manuscripts, documents and diary entries alike. Right-click a
      flagged word for corrections.
    </p>

    <label class="mb-4 flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        class="h-4 w-4"
        style="accent-color: var(--color-accent)"
        :checked="spellEnabled"
        @change="toggleSpell"
      />
      <span class="text-sm">Check spelling as I type</span>
    </label>

    <div v-if="spellEnabled && languages.available.length" class="mb-5">
      <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Spelling
      </label>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="lang in COMMON"
          :key="lang.code"
          class="rounded-xl border px-3 py-2 text-left text-sm transition-colors"
          :class="
            activeLanguage === lang.code
              ? 'border-accent bg-accent-soft text-ink'
              : 'border-border text-ink-dim hover:bg-surface-2'
          "
          :disabled="!languages.available.includes(lang.code)"
          @click="setLanguage(lang.code)"
        >
          {{ lang.label }}
          <span class="block text-[10px] opacity-60">colour / color</span>
        </button>
      </div>

      <button
        v-if="otherLanguages.length"
        class="mt-2 flex items-center gap-1 text-xs text-ink-dim hover:text-ink"
        @click="showAllLanguages = !showAllLanguages"
      >
        <ChevronDown :size="12" :class="showAllLanguages ? 'rotate-180' : ''" class="transition-transform" />
        {{ showAllLanguages ? 'Fewer languages' : 'Other languages' }}
      </button>
      <select
        v-if="showAllLanguages"
        class="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        :value="activeLanguage"
        @change="setLanguage(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="lang in COMMON" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
        <option v-for="code in otherLanguages" :key="code" :value="code">{{ code }}</option>
      </select>
    </div>

    <div v-if="spellEnabled" class="mb-6">
      <div class="mb-1 text-sm font-medium">Your dictionary</div>
      <p class="mb-2 text-xs text-ink-dim">
        Character names, invented places and anything else the dictionary shouldn't flag.
      </p>
      <div class="mb-2 flex gap-2">
        <input
          v-model="newWord"
          placeholder="Add a word…"
          class="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
          @keydown.enter="addWord"
        />
        <button
          class="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
          @click="addWord"
        >
          <Plus :size="14" /> Add
        </button>
      </div>
      <div v-if="words.length" class="flex flex-wrap gap-1">
        <span
          v-for="w in words"
          :key="w"
          class="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs"
        >
          {{ w }}
          <button class="text-ink-dim hover:text-red-400" title="Remove" @click="removeWord(w)">
            <X :size="11" />
          </button>
        </span>
      </div>
      <p v-else class="text-xs text-ink-dim">No custom words yet.</p>
    </div>

    <div class="border-t border-border pt-5">
      <div class="mb-1 flex items-center gap-2">
        <BookA :size="16" class="text-accent" />
        <h3 class="text-sm font-semibold">Thesaurus</h3>
      </div>
      <p class="mb-3 text-xs text-ink-dim">
        Right-click a single word for synonyms and antonyms.
      </p>

      <label class="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          class="mt-0.5 h-4 w-4 shrink-0"
          style="accent-color: var(--color-accent)"
          :checked="thesaurusOn"
          @change="toggleThesaurus"
        />
        <span class="text-sm">Enable the thesaurus</span>
      </label>

      <p class="mt-3 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim">
        <Globe :size="14" class="mt-0.5 shrink-0" />
        This is the only part of Cypher that uses the internet while you write. Looking up a word
        sends that single word to an online dictionary — never the sentence around it, and never
        your document. Leave it off to keep Cypher entirely offline.
      </p>
    </div>
  </div>
</template>
