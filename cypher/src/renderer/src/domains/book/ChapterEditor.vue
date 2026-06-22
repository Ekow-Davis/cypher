<script setup lang="ts">
import { ref, watch, onBeforeUnmount, type Component } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
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
import { useChaptersStore } from '@/stores/chapters'
import type { Chapter } from '@shared/types'

const props = defineProps<{ chapter: Chapter | null }>()
const store = useChaptersStore()

type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const title = ref('')

let loadedId: number | null = null // which chapter is currently in the editor
let loadingContent = false // suppress autosave while we set content programmatically
let saveTimer: ReturnType<typeof setTimeout> | null = null

const editor = useEditor({
  extensions: [StarterKit],
  content: '',
  editorProps: { attributes: { class: 'cypher-prose' } },
  onUpdate: () => {
    if (loadingContent) return
    status.value = 'unsaved'
    scheduleSave()
  },
  onBlur: () => {
    if (status.value !== 'saved') void saveNow()
  }
})

function wordCount(): number {
  const text = editor.value?.getText().trim() ?? ''
  return text ? text.split(/\s+/).length : 0
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 600)
}

async function saveNow(): Promise<void> {
  if (loadedId == null || !editor.value) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  status.value = 'saving'
  const json = JSON.stringify(editor.value.getJSON())
  await store.saveContent(loadedId, json, wordCount())
  status.value = 'saved'
}

function loadChapter(ch: Chapter | null): void {
  const ed = editor.value
  if (!ed) return
  loadingContent = true
  loadedId = ch?.id ?? null
  title.value = ch?.title ?? ''
  let content: unknown = ''
  if (ch?.content) {
    try {
      content = JSON.parse(ch.content)
    } catch {
      content = ch.content
    }
  }
  ed.commands.setContent(content as never)
  status.value = 'saved'
  loadingContent = false
}

// Load the first chapter once the editor is ready.
watch(
  () => editor.value,
  (ed) => {
    if (ed && loadedId === null && props.chapter) loadChapter(props.chapter)
  },
  { immediate: true }
)

// Switching chapters: flush the outgoing one, then load the incoming one.
watch(
  () => props.chapter?.id,
  async (newId, oldId) => {
    if (newId === loadedId) return
    if (oldId != null && status.value !== 'saved') await saveNow()
    loadChapter(props.chapter)
  }
)

async function onTitleCommit(): Promise<void> {
  if (props.chapter && title.value.trim() && title.value !== props.chapter.title) {
    await store.rename(props.chapter.id, title.value.trim())
  }
}

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
    <!-- title + save status -->
    <div class="flex items-center gap-3 border-b border-border px-6 py-3">
      <input
        v-model="title"
        class="flex-1 bg-transparent text-lg font-semibold outline-none"
        placeholder="Chapter title"
        @blur="onTitleCommit"
        @keydown.enter="onTitleCommit"
      />
      <span class="shrink-0 text-xs text-ink-dim">{{
        status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'
      }}</span>
    </div>

    <!-- toolbar -->
    <div
      v-if="editor"
      class="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2"
    >
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

    <!-- editor surface -->
    <div class="flex-1 overflow-auto px-6 py-8">
      <EditorContent :editor="editor" class="mx-auto max-w-prose" />
    </div>
  </div>
</template>
