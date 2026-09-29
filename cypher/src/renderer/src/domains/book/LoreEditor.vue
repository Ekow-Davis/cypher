<script setup lang="ts">
import { ref, watch, onBeforeUnmount, type Component } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import {
  createCharacterMention,
  mentionClickHandler,
  syncMentionLabels,
  mentionNamesKey
} from '@/lib/characterMention'
import { useBookUiStore } from '@/stores/bookUi'
import { usePreferencesStore } from '@/stores/preferences'
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  AtSign
} from 'lucide-vue-next'
import { useLoreStore } from '@/stores/lore'
import WritingTextControls from '@/components/WritingTextControls.vue'
import LibraryStatusButton from './LibraryStatusButton.vue'
import { TextRules } from '@/lib/textRules'
import { useCharactersStore } from '@/stores/characters'
import { buildRefIndex, resolveHandles } from '@/lib/mentionRefs'
import type { LoreEntry } from '@shared/types'

const props = defineProps<{ entry: LoreEntry | null }>()
const store = useLoreStore()
const bookUi = useBookUiStore()
const prefs = usePreferencesStore()
const characters = useCharactersStore()

type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const title = ref('')
const category = ref('')

let loadedId: number | null = null
let loadingContent = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

const editor = useEditor({
  // @ offers the cast and every other lore entry, so entries can point at
  // one another; the entry being edited is left out of its own list.
  extensions: [
    StarterKit,
    createCharacterMention({ lore: true, excludeLoreId: () => loadedId }),
    TextRules
  ],
  content: '',
  editorProps: {
    attributes: { class: 'cypher-prose' },
    handleClick: mentionClickHandler(
      (id) => bookUi.openCharacter(id),
      (id) => void openLoreEntry(id)
    )
  },
  onUpdate: () => {
    if (loadingContent) return
    status.value = 'unsaved'
    scheduleSave()
  },
  onBlur: () => {
    if (status.value !== 'saved') void saveNow()
  }
})

const linkNote = ref<string | null>(null)
let linkNoteTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Converts typed @Handles in this entry into references — for text pasted in
 * from elsewhere, or handles written before their entry existed. One
 * transaction, so a single undo puts the text back.
 */
function linkHandles(): void {
  const ed = editor.value
  if (!ed) return
  const index = buildRefIndex(
    store.entries.filter((e) => e.id !== loadedId),
    characters.characters
  )
  const { doc, report } = resolveHandles(ed.getJSON(), index)
  if (report.count) ed.commands.setContent(doc, { emitUpdate: true })
  linkNote.value = report.count
    ? `Linked ${report.count}` + (report.unresolved.length ? ` · ${report.unresolved.length} not found` : '')
    : report.unresolved.length
      ? `No matches for ${report.unresolved.slice(0, 3).join(', ')}`
      : 'No @names to link'
  clearTimeout(linkNoteTimer)
  linkNoteTimer = setTimeout(() => (linkNote.value = null), 4000)
}

async function saveIfDirty(): Promise<void> {
  if (status.value !== 'saved') await saveNow()
}

/** Following a reference to another entry saves this one first. */
async function openLoreEntry(id: number): Promise<void> {
  if (id === loadedId) return
  if (status.value !== 'saved') await saveNow()
  bookUi.openLore(id)
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), prefs.autosaveMs)
}

async function saveNow(): Promise<void> {
  if (loadedId == null || !editor.value) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  status.value = 'saving'
  await store.saveContent(loadedId, JSON.stringify(editor.value.getJSON()))
  status.value = 'saved'
}

function loadEntry(entry: LoreEntry | null): void {
  const ed = editor.value
  if (!ed) return
  loadingContent = true
  loadedId = entry?.id ?? null
  title.value = entry?.title ?? ''
  category.value = entry?.category ?? ''
  let content: unknown = ''
  if (entry?.content) {
    try {
      content = JSON.parse(entry.content)
    } catch {
      content = entry.content
    }
  }
  ed.commands.setContent(content as never)
  status.value = 'saved'
  loadingContent = false
  setTimeout(() => syncMentionLabels(editor.value), 0)
}

watch(mentionNamesKey, () => syncMentionLabels(editor.value))

// Replaced from outside (a library pull): show the new text, don't save over it.
watch(
  () => store.externalEdit,
  (edit) => {
    if (!edit || edit.id !== loadedId) return
    if (saveTimer) clearTimeout(saveTimer)
    const fresh = store.entries.find((e) => e.id === edit.id) ?? null
    loadEntry(fresh)
  }
)

watch(
  () => editor.value,
  (ed) => {
    if (ed && loadedId === null && props.entry) loadEntry(props.entry)
  },
  { immediate: true }
)

watch(
  () => props.entry?.id,
  async (newId) => {
    if (newId === loadedId) return
    if (status.value !== 'saved') await saveNow()
    loadEntry(props.entry)
  }
)

async function onTitleCommit(): Promise<void> {
  if (props.entry && title.value.trim() && title.value !== props.entry.title) {
    await store.rename(props.entry.id, title.value.trim())
  }
}

async function onCategoryCommit(): Promise<void> {
  const next = category.value.trim()
  if (props.entry && next && next !== props.entry.category) {
    await store.setCategory(props.entry.id, next)
  }
}

watch(
  () => [editor.value, prefs.spellcheck] as const,
  ([ed, on]) => {
    const dom = (ed as { view?: { dom?: HTMLElement } } | undefined)?.view?.dom
    if (dom) dom.setAttribute('spellcheck', String(on))
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})

interface Tool {
  label: string
  name: string
  attrs?: Record<string, unknown>
  icon: Component
  run: () => void
}
const tools: Tool[] = [
  { label: 'Bold', name: 'bold', icon: Bold, run: () => editor.value?.chain().focus().toggleBold().run() },
  { label: 'Italic', name: 'italic', icon: Italic, run: () => editor.value?.chain().focus().toggleItalic().run() },
  { label: 'Heading 1', name: 'heading', attrs: { level: 1 }, icon: Heading1, run: () => editor.value?.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', name: 'heading', attrs: { level: 2 }, icon: Heading2, run: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', name: 'heading', attrs: { level: 3 }, icon: Heading3, run: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Quote', name: 'blockquote', icon: Quote, run: () => editor.value?.chain().focus().toggleBlockquote().run() },
  { label: 'Bullet list', name: 'bulletList', icon: List, run: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', name: 'orderedList', icon: ListOrdered, run: () => editor.value?.chain().focus().toggleOrderedList().run() }
]
</script>

<template>
  <div
    class="flex h-full flex-col"
    @keydown.ctrl.s.prevent="saveNow"
    @keydown.meta.s.prevent="saveNow"
  >
    <!-- title + category + status -->
    <div class="flex items-center gap-3 border-b border-border px-6 py-3">
      <input
        v-model="title"
        class="flex-1 bg-transparent text-lg font-semibold outline-none"
        placeholder="Entry title"
        @blur="onTitleCommit"
        @keydown.enter="onTitleCommit"
      />
      <input
        v-model="category"
        list="lore-categories"
        class="w-36 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent-line"
        placeholder="Category"
        @blur="onCategoryCommit"
        @keydown.enter="onCategoryCommit"
      />
      <datalist id="lore-categories">
        <option v-for="c in store.categoryNames" :key="c" :value="c" />
      </datalist>
      <span class="shrink-0 text-xs text-ink-dim">{{
        status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'
      }}</span>
    </div>

    <!-- toolbar -->
    <div v-if="editor" class="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2">
      <button
        v-for="t in tools"
        :key="t.label"
        :title="t.label"
        class="rounded-md p-2 transition-colors"
        :class="
          editor.isActive(t.name, t.attrs)
            ? 'bg-surface-2 text-accent'
            : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
        "
        @click="t.run()"
      >
        <component :is="t.icon" :size="16" />
      </button>
      <span class="mx-1 h-4 w-px shrink-0 bg-border" />
      <button
        class="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        title="Turn typed @Names into links to matching entries and characters"
        @click="linkHandles"
      >
        <AtSign :size="13" /> Link @names
      </button>
      <span v-if="linkNote" class="text-[11px] text-accent">{{ linkNote }}</span>
      <LibraryStatusButton v-if="entry" :entry="entry" :before-push="saveIfDirty" />
      <span class="mx-1 h-4 w-px shrink-0 bg-border" />
      <WritingTextControls />
    </div>

    <div class="flex-1 overflow-auto px-6 py-8">
      <EditorContent :editor="editor" class="mx-auto max-w-prose" />
    </div>
  </div>
</template>
