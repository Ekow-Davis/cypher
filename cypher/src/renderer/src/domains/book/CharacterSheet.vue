<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  ImagePlus,
  Trash2,
  UserRound,
  SlidersHorizontal,
  Check,
  GripVertical,
  Plus,
  FolderPlus,
  RotateCcw,
  AlignLeft,
  Minus
} from 'lucide-vue-next'
import { useCharactersStore } from '@/stores/characters'
import { assetUrl } from '@/lib/assets'
import { defaultCharacterSheet } from '../../../../shared/characterTemplate'
import type { Character, CharacterSheet, CharacterSection, CharacterField } from '@shared/types'

const props = defineProps<{ character: Character }>()
const store = useCharactersStore()

type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const name = ref('')
const folder = ref('')
const sheet = ref<CharacterSheet>({ sections: [] })
const customize = ref(false)

let loadedId: number | null = null
let loadingContent = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

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

// Any edit — a value, a label, a reorder — schedules a save.
watch(
  sheet,
  () => {
    if (loadingContent) return
    status.value = 'unsaved'
    scheduleSave()
  },
  { deep: true }
)

watch(
  () => props.character.id,
  async (newId) => {
    if (newId === loadedId) return
    if (status.value !== 'saved') await saveNow()
    customize.value = false
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

// ---------- layout editing ----------
function addSection(): void {
  sheet.value.sections.push({ id: uid('sec'), title: 'New section', fields: [] })
}
function addField(section: CharacterSection): void {
  section.fields.push({ id: uid('f'), label: 'New field', value: '', type: 'text' })
}
function toggleFieldType(field: CharacterField): void {
  field.type = field.type === 'multiline' ? 'text' : 'multiline'
}

const confirmDelete = ref<
  { kind: 'section'; section: CharacterSection } | { kind: 'field'; section: CharacterSection; field: CharacterField } | null
>(null)

function askDeleteSection(section: CharacterSection): void {
  const hasValues = section.fields.some((f) => f.value.trim())
  if (!hasValues && section.fields.length === 0) {
    removeSection(section)
    return
  }
  confirmDelete.value = { kind: 'section', section }
}
function askDeleteField(section: CharacterSection, field: CharacterField): void {
  if (!field.value.trim()) {
    removeField(section, field)
    return
  }
  confirmDelete.value = { kind: 'field', section, field }
}
function removeSection(section: CharacterSection): void {
  sheet.value.sections = sheet.value.sections.filter((s) => s !== section)
}
function removeField(section: CharacterSection, field: CharacterField): void {
  section.fields = section.fields.filter((f) => f !== field)
}
function doConfirmDelete(): void {
  const c = confirmDelete.value
  if (!c) return
  if (c.kind === 'section') removeSection(c.section)
  else removeField(c.section, c.field)
  confirmDelete.value = null
}

// Restores the base template's structure, carrying over any values whose field
// id still matches, so resetting the layout doesn't wipe what's been written.
const confirmReset = ref(false)
function doReset(): void {
  const existing = new Map<string, string>()
  for (const s of sheet.value.sections) {
    for (const f of s.fields) if (f.value) existing.set(`${s.id}.${f.id}`, f.value)
  }
  const fresh = defaultCharacterSheet()
  for (const s of fresh.sections) {
    for (const f of s.fields) {
      const v = existing.get(`${s.id}.${f.id}`)
      if (v) f.value = v
    }
  }
  sheet.value = fresh
  confirmReset.value = false
}

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- header -->
    <div class="flex items-start gap-4 border-b border-border px-6 py-4">
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

      <div class="flex shrink-0 items-center gap-2">
        <span class="text-xs text-ink-dim">{{
          status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'
        }}</span>
        <button
          class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
          :class="customize ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
          :title="customize ? 'Done customising' : 'Customise this sheet'"
          @click="customize = !customize"
        >
          <component :is="customize ? Check : SlidersHorizontal" :size="15" />
          {{ customize ? 'Done' : 'Customise' }}
        </button>
      </div>
    </div>

    <!-- body -->
    <div class="flex-1 overflow-auto px-6 py-6">
      <div class="mx-auto max-w-3xl space-y-5">
        <p v-if="customize" class="rounded-xl border border-accent-line bg-accent-soft/40 px-4 py-2 text-xs text-ink-dim">
          Customising <span class="font-semibold text-ink">{{ props.character.name }}</span
          >'s sheet only — other characters are unaffected. Drag the grips to reorder; fields can be
          dragged between sections.
        </p>

        <!-- ===== customise mode ===== -->
        <VueDraggable
          v-if="customize"
          v-model="sheet.sections"
          :animation="150"
          handle=".sec-handle"
          class="space-y-5"
        >
          <section
            v-for="section in sheet.sections"
            :key="section.id"
            class="rounded-xl border border-border bg-surface p-4"
          >
            <div class="mb-3 flex items-center gap-2">
              <GripVertical :size="15" class="sec-handle shrink-0 cursor-grab text-ink-dim opacity-60" />
              <input
                v-model="section.title"
                class="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-accent outline-none focus:border-accent-line"
                placeholder="Section title"
              />
              <button
                class="shrink-0 rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink"
                title="Add field"
                @click="addField(section)"
              >
                <Plus :size="14" />
              </button>
              <button
                class="shrink-0 rounded-lg border border-border p-1.5 text-ink-dim hover:text-red-400"
                title="Delete section"
                @click="askDeleteSection(section)"
              >
                <Trash2 :size="14" />
              </button>
            </div>

            <VueDraggable
              v-model="section.fields"
              :group="{ name: 'character-fields' }"
              :animation="150"
              handle=".fld-handle"
              class="min-h-[8px] space-y-2"
            >
              <div
                v-for="field in section.fields"
                :key="field.id"
                class="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5"
              >
                <GripVertical :size="14" class="fld-handle shrink-0 cursor-grab text-ink-dim opacity-60" />
                <input
                  v-model="field.label"
                  class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none focus:border-accent-line"
                  placeholder="Field label (leave blank for a free-form block)"
                />
                <button
                  class="shrink-0 rounded p-1 transition-colors"
                  :class="field.type === 'multiline' ? 'text-accent' : 'text-ink-dim hover:text-ink'"
                  :title="field.type === 'multiline' ? 'Long text — click for single line' : 'Single line — click for long text'"
                  @click="toggleFieldType(field)"
                >
                  <component :is="field.type === 'multiline' ? AlignLeft : Minus" :size="14" />
                </button>
                <button
                  class="shrink-0 rounded p-1 text-ink-dim hover:text-red-400"
                  title="Delete field"
                  @click="askDeleteField(section, field)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </VueDraggable>

            <p v-if="!section.fields.length" class="pt-1 text-xs text-ink-dim">
              No fields — add one, or drag a field here.
            </p>
          </section>
        </VueDraggable>

        <div v-if="customize" class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
            @click="addSection"
          >
            <FolderPlus :size="15" /> Add section
          </button>
          <button
            class="ml-auto flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
            title="Restore the base template layout"
            @click="confirmReset = true"
          >
            <RotateCcw :size="15" /> Reset layout
          </button>
        </div>

        <!-- ===== normal mode ===== -->
        <template v-else>
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
            <p v-if="!section.fields.length" class="text-xs text-ink-dim">No fields in this section.</p>
          </section>
        </template>
      </div>
    </div>

    <!-- delete confirmation -->
    <div
      v-if="confirmDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="confirmDelete = null"
    >
      <div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-2 text-lg font-bold">
          Delete {{ confirmDelete.kind === 'section' ? 'section' : 'field' }}?
        </h2>
        <p class="mb-5 text-sm text-ink-dim">
          <template v-if="confirmDelete.kind === 'section'">
            <span class="font-semibold text-ink">{{ confirmDelete.section.title }}</span> and the
            {{ confirmDelete.section.fields.length }} field(s) inside it will be removed from this
            character. Anything written in them is lost.
          </template>
          <template v-else>
            <span class="font-semibold text-ink">{{ confirmDelete.field.label || 'This field' }}</span>
            has content that will be lost.
          </template>
        </p>
        <div class="flex justify-end gap-2">
          <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="confirmDelete = null">
            Cancel
          </button>
          <button class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90" @click="doConfirmDelete">
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- reset confirmation -->
    <div
      v-if="confirmReset"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="confirmReset = false"
    >
      <div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-2 text-lg font-bold">Reset this sheet's layout?</h2>
        <p class="mb-5 text-sm text-ink-dim">
          The base template's sections and fields come back. Text already written into fields that
          still exist in the template is kept; fields you added yourself are removed.
        </p>
        <div class="flex justify-end gap-2">
          <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="confirmReset = false">
            Cancel
          </button>
          <button class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90" @click="doReset">
            Reset layout
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
