<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { ImagePlus, Trash2, UserRound } from 'lucide-vue-next'
import { useCharactersStore } from '@/stores/characters'
import { assetUrl } from '@/lib/assets'
import { defaultCharacterSheet } from '../../../../shared/characterTemplate'
import type { Character, CharacterSheet } from '@shared/types'

const props = defineProps<{ character: Character }>()
const store = useCharactersStore()

type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const name = ref('')
const folder = ref('')
const sheet = ref<CharacterSheet>({ sections: [] })

let loadedId: number | null = null
let loadingContent = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

function loadCharacter(c: Character): void {
  loadingContent = true
  loadedId = c.id
  name.value = c.name
  folder.value = c.folder ?? ''
  let parsed: CharacterSheet | null = null
  try {
    const obj = JSON.parse(c.fields_json)
    if (obj && Array.isArray(obj.sections)) parsed = obj
  } catch {
    parsed = null
  }
  sheet.value = parsed ?? defaultCharacterSheet()
  status.value = 'saved'
  loadingContent = false
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 600)
}

async function saveNow(): Promise<void> {
  if (loadedId == null) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  status.value = 'saving'
  await store.saveFields(loadedId, JSON.stringify(sheet.value))
  status.value = 'saved'
}

// deep-watch the sheet: any field edit schedules a save
watch(
  sheet,
  () => {
    if (loadingContent) return
    status.value = 'unsaved'
    scheduleSave()
  },
  { deep: true }
)

// switching characters: flush the outgoing one, load the incoming one
watch(
  () => props.character.id,
  async (newId) => {
    if (newId === loadedId) return
    if (status.value !== 'saved') await saveNow()
    loadCharacter(props.character)
  },
  { immediate: true }
)

async function onNameCommit(): Promise<void> {
  const next = name.value.trim()
  if (next && next !== props.character.name) await store.rename(props.character.id, next)
}
async function onFolderCommit(): Promise<void> {
  const next = folder.value.trim()
  if (next !== (props.character.folder ?? '')) {
    await store.setFolder(props.character.id, next || null)
  }
}

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- header -->
    <div class="flex items-start gap-4 border-b border-border px-6 py-4">
      <!-- portrait -->
      <div class="group/img relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
        <img
          v-if="props.character.image_path"
          :src="assetUrl(props.character.image_path)"
          class="h-full w-full object-cover"
          alt="portrait"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-ink-dim">
          <UserRound :size="32" />
        </div>
        <div class="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/50 py-1 opacity-0 transition-opacity group-hover/img:opacity-100">
          <button class="rounded p-1 text-white hover:text-accent" title="Set image" @click="store.importImage(props.character.id)">
            <ImagePlus :size="15" />
          </button>
          <button
            v-if="props.character.image_path"
            class="rounded p-1 text-white hover:text-red-400"
            title="Remove image"
            @click="store.clearImage(props.character.id)"
          >
            <Trash2 :size="15" />
          </button>
        </div>
      </div>

      <!-- name + folder -->
      <div class="min-w-0 flex-1">
        <input
          v-model="name"
          class="w-full bg-transparent text-2xl font-bold outline-none"
          placeholder="Character name"
          @blur="onNameCommit"
          @keydown.enter="onNameCommit"
        />
        <div class="mt-1 flex items-center gap-2">
          <span class="text-xs text-ink-dim">Folder</span>
          <input
            v-model="folder"
            list="character-folders"
            class="w-48 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent-line"
            placeholder="e.g. Main Characters"
            @blur="onFolderCommit"
            @keydown.enter="onFolderCommit"
          />
          <datalist id="character-folders">
            <option v-for="fn in store.folderNames" :key="fn" :value="fn" />
          </datalist>
        </div>
      </div>

      <span class="shrink-0 text-xs text-ink-dim">{{
        status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'
      }}</span>
    </div>

    <!-- sheet body -->
    <div class="flex-1 overflow-auto px-6 py-6">
      <div class="mx-auto max-w-3xl space-y-5">
        <section
          v-for="section in sheet.sections"
          :key="section.id"
          class="rounded-xl border border-border bg-surface p-4"
        >
          <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
            {{ section.title }}
          </h3>
          <div class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div
              v-for="field in section.fields"
              :key="field.id"
              :class="field.type === 'multiline' || !field.label ? 'col-span-2' : ''"
            >
              <label v-if="field.label" class="mb-1 block text-xs text-ink-dim">{{ field.label }}</label>
              <textarea
                v-if="field.type === 'multiline'"
                v-model="field.value"
                rows="3"
                class="w-full resize-y rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
              />
              <input
                v-else
                v-model="field.value"
                class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
