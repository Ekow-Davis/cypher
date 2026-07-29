<script setup lang="ts">
import { ref, watch, onBeforeUnmount, type Component } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { createCharacterMention, mentionClickHandler } from '@/lib/characterMention'
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
  ListOrdered
} from 'lucide-vue-next'
import { useLoreStore } from '@/stores/lore'
import type { LoreEntry } from '@shared/types'

const props = defineProps<{ entry: LoreEntry | null }>()
const store = useLoreStore()
const bookUi = useBookUiStore()
const prefs = usePreferencesStore()

type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const title = ref('')
const category = ref('')

let loadedId: number | null = null
let loadingContent = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

const editor = useEditor({
  extensions: [StarterKit, createCharacterMention()],
  content: '',
  editorProps: {
    attributes: { class: 'cypher-prose' },
    handleClick: mentionClickHandler((id) => bookUi.openCharacter(id))
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
}

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
    </div>

    <div class="flex-1 overflow-auto px-6 py-8">
      <EditorContent :editor="editor" class="mx-auto max-w-prose" />
    </div>
  </div>
</template>
