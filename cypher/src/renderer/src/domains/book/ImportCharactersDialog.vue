<script setup lang="ts">
import { ref, computed } from 'vue'
import { Users, Download, FileInput, Check, Loader2, AlertCircle, Info } from 'lucide-vue-next'
import { useCharactersStore } from '@/stores/characters'
import type { CharacterImportResult } from '@shared/types'

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ close: [] }>()

const store = useCharactersStore()

const busy = ref(false)
const result = ref<CharacterImportResult | null>(null)
const message = ref<string | null>(null)
const error = ref<string | null>(null)
const skipped = ref<Set<number>>(new Set())

const kept = computed(
  () => result.value?.characters.filter((_, i) => !skipped.value.has(i)) ?? []
)

async function downloadTemplate(): Promise<void> {
  busy.value = true
  error.value = null
  message.value = null
  try {
    const res = await window.cypher.characters.downloadTemplate()
    if (res.cancelled) return
    if (res.error) error.value = res.error
    else message.value = `Template saved to ${res.path}`
  } finally {
    busy.value = false
  }
}

async function pick(): Promise<void> {
  busy.value = true
  error.value = null
  message.value = null
  try {
    const imported = await window.cypher.characters.importSheets()
    if (!imported) return
    if (!imported.characters.length) {
      error.value = 'No character sheets found in that file.'
      return
    }
    result.value = imported
    skipped.value = new Set()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function toggle(index: number): void {
  const next = new Set(skipped.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  skipped.value = next
}

async function apply(): Promise<void> {
  if (!kept.value.length) return
  busy.value = true
  error.value = null
  try {
    // createNamed adds without stealing the current selection, so importing a
    // batch doesn't yank the writer away from whoever they had open.
    for (const character of kept.value) {
      const created = await store.createNamed(character.name)
      // saveFields stores the sheet as JSON, matching the fields_json column.
      if (created) await store.saveFields(created.id, JSON.stringify(character.sheet))
    }
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="flex max-h-[86vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface">
      <div class="flex items-center gap-2 border-b border-border px-6 py-4">
        <Users :size="18" class="text-accent" />
        <div>
          <h2 class="text-lg font-bold">Import characters</h2>
          <p class="text-sm text-ink-dim">From filled-in character sheets.</p>
        </div>
      </div>

      <div class="flex-1 space-y-4 overflow-auto px-6 py-4">
        <template v-if="!result">
          <div class="rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-ink-dim">
            <p class="mb-2 flex items-center gap-1.5 font-semibold text-ink">
              <Info :size="13" /> How this works
            </p>
            <p class="mb-1.5">
              Download the template, fill in whatever you like, and bring it back. Cypher matches
              on the field labels, so leave those as they are.
            </p>
            <p>
              To import several characters at once, put them all in one file — start each with a
              <strong>Name:</strong> line.
            </p>
          </div>

          <button
            class="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm text-ink-dim hover:text-ink disabled:opacity-60"
            :disabled="busy"
            @click="downloadTemplate"
          >
            <Download :size="15" /> Download the template
          </button>

          <button
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-on-accent disabled:opacity-60"
            :disabled="busy"
            @click="pick"
          >
            <Loader2 v-if="busy" :size="15" class="animate-spin" />
            <FileInput v-else :size="15" />
            Choose a filled-in sheet…
          </button>
        </template>

        <template v-else>
          <div class="rounded-xl border border-border bg-surface-2/60 p-3">
            <p class="text-sm font-medium">{{ result.fileName }}</p>
            <p class="mt-0.5 text-xs text-ink-dim">
              {{ result.characters.length }} character{{ result.characters.length === 1 ? '' : 's' }} found
            </p>
          </div>

          <div class="max-h-64 overflow-auto rounded-xl border border-border">
            <label
              v-for="(character, index) in result.characters"
              :key="index"
              class="flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-2"
              :class="skipped.has(index) ? 'opacity-45' : ''"
            >
              <input
                type="checkbox"
                class="mt-1 h-3.5 w-3.5 shrink-0"
                style="accent-color: var(--color-accent)"
                :checked="!skipped.has(index)"
                @change="toggle(index)"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{{ character.name }}</span>
                <span class="block text-[10px] text-ink-dim">
                  {{ character.filled }} field{{ character.filled === 1 ? '' : 's' }} filled
                </span>
              </span>
            </label>
          </div>

          <p
            v-if="result.unknownLabels.length"
            class="rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-ink-dim"
          >
            Ignored {{ result.unknownLabels.length }} label(s) that aren't in the template:
            {{ result.unknownLabels.slice(0, 6).join(', ') }}<span v-if="result.unknownLabels.length > 6">…</span>
          </p>
        </template>

        <p v-if="message" class="flex items-start gap-2 break-all rounded-lg bg-accent-soft px-3 py-2 text-xs">
          <Check :size="14" class="mt-0.5 shrink-0 text-accent" />{{ message }}
        </p>
        <p v-if="error" class="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
        </p>
      </div>

      <div class="flex items-center gap-2 border-t border-border px-6 py-4">
        <button
          v-if="result"
          class="rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink"
          @click="result = null"
        >
          Choose another
        </button>
        <button class="ml-auto rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="emit('close')">
          Cancel
        </button>
        <button
          v-if="result"
          class="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
          :disabled="busy || !kept.length"
          @click="apply"
        >
          <Loader2 v-if="busy" :size="14" class="animate-spin" />
          <Check v-else :size="14" />
          Add {{ kept.length }}
        </button>
      </div>
    </div>
  </div>
</template>
