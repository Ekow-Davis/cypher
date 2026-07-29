<script setup lang="ts">
import { ref, reactive, watch, onBeforeUnmount, type Component } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { createCharacterMention, mentionClickHandler } from '@/lib/characterMention'
import { useBookUiStore } from '@/stores/bookUi'
import { usePreferencesStore } from '@/stores/preferences'
import { useAppStore } from '@/stores/app'
import { useCharactersStore } from '@/stores/characters'
import type { ChapterStatus } from '@shared/types'
import {
  Info,
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
const bookUi = useBookUiStore()
const prefs = usePreferencesStore()
const app = useAppStore()
const characters = useCharactersStore()

type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const title = ref('')

let loadedId: number | null = null // which chapter is currently in the editor
let loadingContent = false // suppress autosave while we set content programmatically
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

const FOCUS_WIDTH: Record<string, string> = {
  narrow: 'max-w-xl',
  medium: 'max-w-2xl',
  wide: 'max-w-4xl'
}

// ----- chapter metadata (separate from `status`, which is the save indicator) -----
const showMeta = ref(false)
const meta = reactive<{ synopsis: string; status: ChapterStatus; povId: number | null }>({
  synopsis: '',
  status: 'draft',
  povId: null
})
let metaTimer: ReturnType<typeof setTimeout> | null = null

const STATUSES: { key: ChapterStatus; label: string; dot: string }[] = [
  { key: 'outline', label: 'Outline', dot: 'bg-slate-400' },
  { key: 'draft', label: 'Draft', dot: 'bg-amber-400' },
  { key: 'revised', label: 'Revised', dot: 'bg-sky-400' },
  { key: 'final', label: 'Final', dot: 'bg-emerald-400' }
]

function setStatus(next: ChapterStatus): void {
  meta.status = next
  if (loadedId != null) void store.saveMeta(loadedId, { status: next })
}
function setPov(value: string): void {
  const id = value === '' ? null : Number(value)
  meta.povId = id
  if (loadedId != null) void store.saveMeta(loadedId, { pov_character_id: id })
}
function scheduleMetaSave(): void {
  if (metaTimer) clearTimeout(metaTimer)
  metaTimer = setTimeout(() => {
    if (loadedId != null) void store.saveMeta(loadedId, { synopsis: meta.synopsis })
  }, 600)
}

function wordCount(): number {
  const text = editor.value?.getText().trim() ?? ''
  return text ? text.split(/\s+/).length : 0
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
  meta.synopsis = ch?.synopsis ?? ''
  meta.status = (ch?.status as ChapterStatus) ?? 'draft'
  meta.povId = ch?.pov_character_id ?? null
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
  if (metaTimer) clearTimeout(metaTimer)
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
      <button
        v-if="!app.focusMode"
        class="shrink-0 rounded-lg border border-border p-1.5 transition-colors"
        :class="showMeta ? 'text-accent' : 'text-ink-dim hover:text-ink'"
        title="Chapter details"
        @click="showMeta = !showMeta"
      >
        <Info :size="15" />
      </button>
      <span class="shrink-0 text-xs text-ink-dim">{{
        status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'
      }}</span>
    </div>

    <!-- chapter details -->
    <div v-if="showMeta && !app.focusMode" class="space-y-3 border-b border-border px-6 py-3">
      <div class="flex flex-wrap items-center gap-4">
        <div>
          <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">Status</div>
          <div class="flex gap-1">
            <button
              v-for="st in STATUSES"
              :key="st.key"
              class="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors"
              :class="meta.status === st.key ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
              @click="setStatus(st.key)"
            >
              <span class="h-2 w-2 rounded-full" :class="st.dot" />
              {{ st.label }}
            </button>
          </div>
        </div>
        <div>
          <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
            POV character
          </div>
          <select
            :value="meta.povId ?? ''"
            class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent-line"
            @change="setPov(($event.target as HTMLSelectElement).value)"
          >
            <option value="">None</option>
            <option v-for="c in characters.characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>
      <div>
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">Synopsis</div>
        <textarea
          v-model="meta.synopsis"
          rows="2"
          placeholder="What happens in this chapter…"
          class="w-full resize-y rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
          @input="scheduleMetaSave"
        />
      </div>
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
    <div class="flex-1 overflow-auto px-6" :class="app.focusMode ? 'py-16' : 'py-8'">
      <EditorContent
        :editor="editor"
        class="mx-auto"
        :class="app.focusMode ? FOCUS_WIDTH[prefs.focusWidth] : 'max-w-prose'"
      />
    </div>
  </div>
</template>
