<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Search, UserRound } from 'lucide-vue-next'
import { useCharactersStore } from '@/stores/characters'
import { assetUrl } from '@/lib/assets'
import { countMatches, snippetHtml } from '@/lib/search'
import type { CharacterSheet } from '@shared/types'

const emit = defineEmits<{ close: [] }>()
const store = useCharactersStore()

type Mode = 'name' | 'details'
const mode = ref<Mode>('name')
const query = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(() => input.value?.focus())

/** Parse every character's sheet once per cast change, not per keystroke. */
const detailIndex = computed(() => {
  return store.characters.map((c) => {
    const fields: { label: string; value: string; section: string }[] = []
    try {
      const sheet = JSON.parse(c.fields_json) as CharacterSheet
      for (const section of sheet.sections ?? []) {
        for (const f of section.fields ?? []) {
          if (f.value?.trim()) {
            fields.push({ label: f.label || section.title, value: f.value, section: section.title })
          }
        }
      }
    } catch {
      /* unparsable sheet — skip */
    }
    return { character: c, fields }
  })
})

const nameResults = computed(() => {
  const q = query.value.trim()
  if (q.length < 1) return []
  return store.characters
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ character: c, hits: [] as { label: string; snippet: string }[] }))
})

const detailResults = computed(() => {
  const q = query.value.trim()
  if (q.length < 2) return []
  return detailIndex.value
    .map(({ character, fields }) => {
      const hits = fields
        .filter((f) => countMatches(f.value, q) > 0)
        .slice(0, 4)
        .map((f) => ({ label: f.label, snippet: snippetHtml(f.value, q, 50) }))
      return hits.length ? { character, hits } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.hits.length - a.hits.length)
})

const results = computed(() => (mode.value === 'name' ? nameResults.value : detailResults.value))
const minChars = computed(() => (mode.value === 'name' ? 1 : 2))
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-border px-3 py-2">
      <div class="mb-2 flex items-center gap-1.5">
        <Search :size="14" class="shrink-0 text-ink-dim" />
        <input
          ref="input"
          v-model="query"
          :placeholder="mode === 'name' ? 'Search by name…' : 'Search sheet details…'"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
          @keydown.esc="emit('close')"
        />
        <button class="shrink-0 rounded p-0.5 text-ink-dim hover:text-ink" title="Close search" @click="emit('close')">
          <X :size="14" />
        </button>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <button
          class="rounded-md border px-1 py-1 text-[11px]"
          :class="mode === 'name' ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          @click="mode = 'name'"
        >
          By name
        </button>
        <button
          class="rounded-md border px-1 py-1 text-[11px]"
          :class="mode === 'details' ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          @click="mode = 'details'"
        >
          By detail
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto py-2">
      <p v-if="query.trim().length < minChars" class="px-4 py-3 text-xs text-ink-dim">
        Type at least {{ minChars }} character{{ minChars > 1 ? 's' : '' }}.
      </p>
      <template v-else>
        <button
          v-for="r in results"
          :key="r.character.id"
          class="mx-2 mb-1 block w-[calc(100%-1rem)] rounded-lg px-2 py-2 text-left transition-colors"
          :class="store.activeId === r.character.id ? 'bg-accent-soft' : 'hover:bg-surface-2'"
          @click="store.setActive(r.character.id)"
        >
          <div class="flex items-center gap-2">
            <span class="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2">
              <img
                v-if="r.character.image_path"
                :src="assetUrl(r.character.image_path)"
                class="h-full w-full object-cover"
                alt=""
              />
              <span v-else class="flex h-full w-full items-center justify-center text-ink-dim">
                <UserRound :size="12" />
              </span>
            </span>
            <span class="min-w-0 flex-1 truncate text-sm">{{ r.character.name }}</span>
            <span class="shrink-0 text-[10px] text-ink-dim">{{ r.character.folder || 'Unfiled' }}</span>
          </div>
          <div v-if="r.hits.length" class="mt-1 space-y-0.5 pl-8">
            <p v-for="(h, i) in r.hits" :key="i" class="truncate text-[11px] text-ink-dim">
              <span class="font-semibold">{{ h.label }}:</span>
              <span v-html="h.snippet"></span>
            </p>
          </div>
        </button>
        <p v-if="!results.length" class="px-4 py-3 text-xs text-ink-dim">No matches.</p>
      </template>
    </div>
  </div>
</template>
