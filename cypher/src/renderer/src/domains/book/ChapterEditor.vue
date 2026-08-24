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
  ListOrdered, SplitSquareVertical, Loader2 } from 'lucide-vue-next'
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
    refreshStats()
    if (loadingContent) return
    status.value = 'unsaved'
    scheduleSave()
  },
  // Selection changes don't dirty the document, but they do change what the
  // counter should be reporting.
  onSelectionUpdate: () => refreshStats(),
  onCreate: () => refreshStats(),
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

/** Words and characters, live — for the whole chapter or just the selection. */
const stats = ref({ words: 0, chars: 0, selected: false })
const showSplit = ref(false)
const splitTitle = ref('')
const splitNotice = ref<string | null>(null)

function refreshStats(): void {
  const ed = editor.value
  if (!ed) return
  const { from, to, empty } = ed.state.selection
  const text = empty
    ? ed.getText()
    : ed.state.doc.textBetween(from, to, ' ')
  const trimmed = text.trim()
  stats.value = {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: text.length,
    selected: !empty
  }
}

const splitting = ref(false)

/**
 * Splits this chapter at the cursor. Everything from the cursor onward moves
 * into a new chapter placed directly below — which is why the caret position,
 * not the selection, is what matters.
 */
async function splitHere(): Promise<void> {
  const ed = editor.value
  if (!ed || loadedId == null) return
  const at = ed.state.selection.from
  const docEnd = ed.state.doc.content.size

  if (at <= 1 || at >= docEnd - 1) {
    splitNotice.value = 'Place the cursor where the new chapter should begin.'
    setTimeout(() => (splitNotice.value = null), 4000)
    return
  }

  splitting.value = true
  try {
    // Slice the document at the caret. Cutting the JSON rather than the text
    // keeps formatting, images and marks intact on both sides.
    const firstJson = ed.state.doc.cut(0, at).toJSON()
    const secondJson = ed.state.doc.cut(at, docEnd).toJSON()

    const countOf = (node: unknown): number => {
      const parts: string[] = []
      const walk = (n: any): void => {
        if (typeof n?.text === 'string') parts.push(n.text)
        n?.content?.forEach(walk)
      }
      walk(node)
      const t = parts.join(' ').trim()
      return t ? t.split(/\s+/).length : 0
    }

    await store.split({
      id: loadedId,
      firstContent: JSON.stringify(firstJson),
      firstWordCount: countOf(firstJson),
      secondTitle: splitTitle.value.trim() || `${title.value} (continued)`,
      secondContent: JSON.stringify(secondJson),
      secondWordCount: countOf(secondJson)
    })
    splitTitle.value = ''
    showSplit.value = false
  } finally {
    splitting.value = false
  }
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
  // stats belong to the chapter on screen
  setTimeout(refreshStats, 0)
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
        :class="showSplit ? 'text-accent' : 'text-ink-dim hover:text-ink'"
        title="Split this chapter at the cursor"
        @click="showSplit = !showSplit"
      >
        <SplitSquareVertical :size="15" />
      </button>
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

    <!-- split -->
    <div v-if="showSplit && !app.focusMode" class="border-b border-border px-6 py-3">
      <p class="mb-2 text-xs text-ink-dim">
        Everything from the cursor onward moves into a new chapter, placed directly below this one.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="splitTitle"
          class="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
          :placeholder="`New chapter title (default: ${title} (continued))`"
          @keydown.enter.prevent="splitHere"
        />
        <button
          class="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-60"
          :disabled="splitting"
          @click="splitHere"
        >
          <Loader2 v-if="splitting" :size="14" class="animate-spin" />
          <SplitSquareVertical v-else :size="14" />
          Split here
        </button>
        <button
          class="shrink-0 rounded-lg px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
          @click="showSplit = false"
        >
          Cancel
        </button>
      </div>
      <p v-if="splitNotice" class="mt-2 text-xs text-amber-400">{{ splitNotice }}</p>
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

    <!-- live counter; reports the selection when there is one -->
    <div
      v-if="!app.focusMode"
      class="flex items-center gap-4 border-t border-border px-6 py-1.5 text-[11px] text-ink-dim"
    >
      <span v-if="stats.selected" class="font-medium text-accent">Selection</span>
      <span class="tabular-nums">{{ stats.words.toLocaleString() }} words</span>
      <span class="tabular-nums">{{ stats.chars.toLocaleString() }} characters</span>
    </div>
  </div>
</template>
