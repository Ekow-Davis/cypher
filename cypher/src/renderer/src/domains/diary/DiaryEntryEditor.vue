<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { Eye, EyeOff, Clock, Trash2 } from 'lucide-vue-next'
import { useDiaryStore } from '@/stores/diary'
import { usePreferencesStore } from '@/stores/preferences'
import type { DiaryEntry } from '@shared/types'

const props = defineProps<{ entry: DiaryEntry }>()
const emit = defineEmits<{ requestTranslate: [] }>()

const store = useDiaryStore()
const prefs = usePreferencesStore()

type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const title = ref('')
const content = ref('')

let loadedId: number | null = null
let loadingContent = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * "Translation" is a font swap, not a decryption step — the text is already
 * decrypted in memory. Rendering it in the personal script keeps it unreadable
 * over a shoulder without a second round trip through the crypto layer.
 */
const translated = computed(() => store.translated)

const remainingLabel = computed(() => {
  const mins = Math.ceil(store.translateRemaining / 60000)
  return mins > 0 ? `${mins}m left` : ''
})

function load(entry: DiaryEntry): void {
  loadingContent = true
  loadedId = entry.id
  title.value = entry.title
  content.value = entry.content
  status.value = 'saved'
  loadingContent = false
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), prefs.autosaveMs)
}

async function saveNow(): Promise<void> {
  if (loadedId == null) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  status.value = 'saving'
  await store.saveEntry(loadedId, title.value, content.value)
  status.value = 'saved'
}

function onEdit(): void {
  if (loadingContent) return
  status.value = 'unsaved'
  scheduleSave()
}

watch(
  () => props.entry.id,
  async (next) => {
    if (next === loadedId) return
    if (status.value !== 'saved') await saveNow()
    load(props.entry)
  },
  { immediate: true }
)

function fmtDate(iso: string): string {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  if (status.value !== 'saved') void saveNow()
})
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
      <input
        v-model="title"
        class="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
        :class="translated ? '' : 'font-script'"
        placeholder="Untitled entry"
        @input="onEdit"
      />

      <button
        v-if="translated"
        class="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent-line px-2.5 py-1 text-xs text-accent"
        title="Hide the plain text again"
        @click="store.lockTranslation()"
      >
        <EyeOff :size="14" />
        <span v-if="remainingLabel" class="flex items-center gap-1">
          <Clock :size="11" /> {{ remainingLabel }}
        </span>
        <span v-else>Hide</span>
      </button>
      <button
        v-else
        class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-ink-dim transition-colors hover:text-ink"
        title="Reveal this entry in plain text"
        @click="emit('requestTranslate')"
      >
        <Eye :size="14" /> Translate
      </button>

      <span class="shrink-0 text-xs text-ink-dim">{{
        status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'
      }}</span>
      <button
        class="shrink-0 rounded-lg p-1.5 text-ink-dim transition-colors hover:text-red-400"
        title="Delete entry"
        @click="store.removeEntry(props.entry.id)"
      >
        <Trash2 :size="15" />
      </button>
    </div>

    <div class="border-b border-border px-6 py-1.5 text-[11px] text-ink-dim">
      Written {{ fmtDate(props.entry.created_at) }}
      <span v-if="props.entry.updated_at !== props.entry.created_at">
        · edited {{ fmtDate(props.entry.updated_at) }}
      </span>
    </div>

    <div class="flex-1 overflow-auto px-6 py-6">
      <textarea
        v-model="content"
        class="mx-auto block h-full w-full max-w-2xl resize-none bg-transparent text-base leading-relaxed outline-none"
        :class="translated ? '' : 'font-script'"
        placeholder="Write freely — this is only for you."
        @input="onEdit"
      />
    </div>
  </div>
</template>
