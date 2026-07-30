<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Node } from '@tiptap/core'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
// extension-text-style has no default export and bundles Color, FontFamily,
// FontSize and LineHeight — importing a default here is what broke the route.
import { TextStyle, Color, FontFamily, FontSize, LineHeight } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
// extension-table is named-only; TableKit bundles Table/Row/Cell/Header.
import { TableKit } from '@tiptap/extension-table'
import TiptapImage from '@tiptap/extension-image'
import {
  ArrowLeft,
  X,
  FileStack,
  BookOpen,
  ScrollText,
  FileDown,
  Table as TableIcon,
  ImagePlus,
  Rows3,
  Columns3,
  Trash2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo2,
  Redo2,
  RemoveFormatting,
  Link2,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Minus,
  Plus,
  Highlighter,
  Baseline
} from 'lucide-vue-next'
import { useDocumentsStore } from '@/stores/documents'
import { usePreferencesStore } from '@/stores/preferences'
import { assetUrl } from '@/lib/assets'

const route = useRoute()
const router = useRouter()
const store = useDocumentsStore()
const prefs = usePreferencesStore()

const id = Number(route.params.id)
type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const title = ref('')
const zoom = ref(100)
const showColor = ref(false)
const isSecondary = ref(false)

/**
 * Documents always open in their own window, so "back" in a spawned window
 * should close it — navigating instead would leave two windows showing the
 * same list.
 */
async function leave(): Promise<void> {
  if (status.value !== 'saved') await saveNow()
  if (isSecondary.value) {
    await window.cypher.windows.close()
    return
  }
  void router.push('/document')
}

let loadedId: number | null = null
let loadingContent = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

const FONTS = [
  { label: 'Default', value: '' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Candara, sans-serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' }
]
const SIZES = ['10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt', '32pt']
const LINE_HEIGHTS = [
  { label: 'Single', value: '1.15' },
  { label: '1.5 lines', value: '1.5' },
  { label: 'Double', value: '2' }
]
const COLORS = ['#111111', '#c0392b', '#d35400', '#b7950b', '#1e8449', '#1f618d', '#6c3483']
const HIGHLIGHTS = ['#fff3a3', '#ffd0d0', '#c8f7d4', '#cfe8ff', '#e8d5ff']

/**
 * An explicit page break. Rendered as a labelled divider on screen; because it
 * carries `break-after: page` in print styles, it becomes a genuine page break
 * when the document is printed or exported to PDF.
 */
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },
  renderHTML() {
    return ['div', { 'data-page-break': 'true', class: 'cypher-page-break' }]
  },
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({ type: 'pageBreak' })
    } as never
  }
})

/**
 * Tiptap's Image has no width attribute, so pictures would always render at
 * their natural size. This adds one, persisted as an inline style.
 */
const SizedImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.width || el.getAttribute('width') || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.width ? { style: `width: ${attrs.width}` } : {}
      }
    }
  }
})

const editor = useEditor({
  extensions: [
    StarterKit,
    Underline,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    LineHeight,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({ openOnClick: false, autolink: true }),
    Subscript,
    Superscript,
    CharacterCount,
    TableKit.configure({ table: { resizable: true } }),
    PageBreak,
    SizedImage.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder: 'Start writing…' })
  ],
  content: '',
  editorProps: { attributes: { class: 'cypher-doc' } },
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

async function boot(): Promise<void> {
  if (!store.loaded) await store.load()
  const doc = store.getById(id)
  if (!doc || !editor.value) return
  loadingContent = true
  loadedId = doc.id
  store.openId = doc.id
  title.value = doc.title
  let content: unknown = ''
  if (doc.content) {
    try {
      content = JSON.parse(doc.content)
    } catch {
      content = doc.content
    }
  }
  editor.value.commands.setContent(content as never)
  status.value = 'saved'
  loadingContent = false
}

watch(() => editor.value, (ed) => { if (ed && loadedId === null) void boot() }, { immediate: true })

// spellcheck follows the global preference, applied live
watch(
  () => [editor.value, prefs.spellcheck] as const,
  ([ed, on]) => {
    const dom = (ed as { view?: { dom?: HTMLElement } } | undefined)?.view?.dom
    if (dom) dom.setAttribute('spellcheck', String(on))
  },
  { immediate: true }
)

async function commitTitle(): Promise<void> {
  const next = title.value.trim()
  if (loadedId != null && next && next !== store.getById(loadedId)?.title) {
    await store.rename(loadedId, next)
  }
}

function setLink(): void {
  const previous = editor.value?.getAttributes('link').href ?? ''
  const url = window.prompt('Link URL', previous)
  if (url === null) return
  if (url === '') {
    editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

type RibbonTab = 'home' | 'insert' | 'layout'
const ribbonTab = ref<RibbonTab>('home')
const RIBBON_TABS: { key: RibbonTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'insert', label: 'Insert' },
  { key: 'layout', label: 'Layout' }
]

/**
 * Cover-page presets. These insert ordinary editable content rather than a
 * locked-down node, so the design can be adjusted afterwards like any text.
 */
const COVERS: { key: string; label: string }[] = [
  { key: 'classic', label: 'Classic' },
  { key: 'modern', label: 'Modern' },
  { key: 'minimal', label: 'Minimal' }
]

function coverContent(kind: string, docTitle: string): unknown[] {
  const heading = (text: string, size: string, align: string) => ({
    type: 'paragraph',
    attrs: { textAlign: align },
    content: [{ type: 'text', marks: [{ type: 'textStyle', attrs: { fontSize: size } }], text }]
  })
  const spacer = () => ({ type: 'paragraph' })

  if (kind === 'modern') {
    return [
      spacer(),
      heading(docTitle, '40pt', 'left'),
      { type: 'horizontalRule' },
      heading('Subtitle or tagline', '14pt', 'left'),
      spacer(),
      heading(prefs.defaultAuthor || 'Author name', '12pt', 'left')
    ]
  }
  if (kind === 'minimal') {
    return [
      spacer(),
      spacer(),
      heading(docTitle.toUpperCase(), '18pt', 'center'),
      spacer(),
      heading(prefs.defaultAuthor || 'Author name', '11pt', 'center')
    ]
  }
  return [
    spacer(),
    spacer(),
    heading(docTitle, '32pt', 'center'),
    heading('Subtitle or tagline', '14pt', 'center'),
    { type: 'horizontalRule' },
    spacer(),
    heading(prefs.defaultAuthor || 'Author name', '12pt', 'center'),
    heading(new Date().toLocaleDateString(), '11pt', 'center')
  ]
}

function insertCover(kind: string): void {
  const ed = editor.value
  if (!ed) return
  // Covers belong at the very start, followed by a break onto the real content.
  ed.chain()
    .focus()
    .insertContentAt(0, [...coverContent(kind, title.value || 'Document title'), { type: 'pageBreak' }])
    .run()
}

function insertTable(): void {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

async function insertImage(): Promise<void> {
  const ref = await window.cypher.docs.importImage()
  if (!ref) return
  const src = assetUrl(ref)
  if (src) editor.value?.chain().focus().setImage({ src }).run()
}

function setImageWidth(width: string | null): void {
  editor.value?.chain().focus().updateAttributes('image', { width }).run()
}

const inTable = computed(() => !!editor.value?.isActive('table'))
const onImage = computed(() => !!editor.value?.isActive('image'))

const wordCount = computed(() => editor.value?.storage.characterCount.words() ?? 0)
const charCount = computed(() => editor.value?.storage.characterCount.characters() ?? 0)

interface Tool {
  label: string
  icon: Component
  active?: () => boolean
  run: () => void
}
const marks: Tool[] = [
  { label: 'Bold', icon: Bold, active: () => !!editor.value?.isActive('bold'), run: () => editor.value?.chain().focus().toggleBold().run() },
  { label: 'Italic', icon: Italic, active: () => !!editor.value?.isActive('italic'), run: () => editor.value?.chain().focus().toggleItalic().run() },
  { label: 'Underline', icon: UnderlineIcon, active: () => !!editor.value?.isActive('underline'), run: () => editor.value?.chain().focus().toggleUnderline().run() },
  { label: 'Strikethrough', icon: Strikethrough, active: () => !!editor.value?.isActive('strike'), run: () => editor.value?.chain().focus().toggleStrike().run() },
  { label: 'Subscript', icon: SubIcon, active: () => !!editor.value?.isActive('subscript'), run: () => editor.value?.chain().focus().toggleSubscript().run() },
  { label: 'Superscript', icon: SupIcon, active: () => !!editor.value?.isActive('superscript'), run: () => editor.value?.chain().focus().toggleSuperscript().run() }
]
const aligns: Tool[] = [
  { label: 'Align left', icon: AlignLeft, active: () => !!editor.value?.isActive({ textAlign: 'left' }), run: () => editor.value?.chain().focus().setTextAlign('left').run() },
  { label: 'Centre', icon: AlignCenter, active: () => !!editor.value?.isActive({ textAlign: 'center' }), run: () => editor.value?.chain().focus().setTextAlign('center').run() },
  { label: 'Align right', icon: AlignRight, active: () => !!editor.value?.isActive({ textAlign: 'right' }), run: () => editor.value?.chain().focus().setTextAlign('right').run() },
  { label: 'Justify', icon: AlignJustify, active: () => !!editor.value?.isActive({ textAlign: 'justify' }), run: () => editor.value?.chain().focus().setTextAlign('justify').run() }
]
const blocks: Tool[] = [
  { label: 'Bullet list', icon: List, active: () => !!editor.value?.isActive('bulletList'), run: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: ListOrdered, active: () => !!editor.value?.isActive('orderedList'), run: () => editor.value?.chain().focus().toggleOrderedList().run() },
  { label: 'Quote', icon: Quote, active: () => !!editor.value?.isActive('blockquote'), run: () => editor.value?.chain().focus().toggleBlockquote().run() },
  { label: 'Code block', icon: Code, active: () => !!editor.value?.isActive('codeBlock'), run: () => editor.value?.chain().focus().toggleCodeBlock().run() }
]

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void saveNow()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  try {
    isSecondary.value = await window.cypher.windows.isSecondary()
  } catch {
    /* older main process — behave as a primary window */
  }
})
onBeforeUnmount(() => {
  store.openId = null
  window.removeEventListener('keydown', onKeydown)
  if (saveTimer) clearTimeout(saveTimer)
  if (status.value !== 'saved') void saveNow()
})
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- title bar -->
    <header class="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <button
        class="flex shrink-0 items-center gap-1 text-sm text-ink-dim hover:text-ink"
        :title="isSecondary ? 'Close this window' : 'All documents'"
        @click="leave"
      >
        <component :is="isSecondary ? X : ArrowLeft" :size="18" />
      </button>
      <input
        v-model="title"
        class="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
        placeholder="Untitled document"
        @blur="commitTitle"
        @keydown.enter="commitTitle"
      />
      <span class="shrink-0 text-xs text-ink-dim">{{
        status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'
      }}</span>
    </header>

    <!-- ribbon -->
    <!-- ribbon tabs -->
    <div v-if="editor" class="flex items-center gap-1 border-b border-border bg-surface px-3 pt-1.5">
      <button
        v-for="t in RIBBON_TABS"
        :key="t.key"
        class="rounded-t-lg border border-b-0 px-3 py-1 text-xs transition-colors"
        :class="
          ribbonTab === t.key
            ? 'border-border bg-surface-2 text-ink'
            : 'border-transparent text-ink-dim hover:text-ink'
        "
        @click="ribbonTab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- HOME -->
    <div
      v-if="editor && ribbonTab === 'home'"
      class="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2/60 px-3 py-1.5"
    >
      <button class="doc-btn" title="Undo" @click="editor.chain().focus().undo().run()"><Undo2 :size="15" /></button>
      <button class="doc-btn" title="Redo" @click="editor.chain().focus().redo().run()"><Redo2 :size="15" /></button>
      <span class="doc-sep" />

      <select
        class="doc-select"
        title="Font"
        @change="editor.chain().focus().setFontFamily(($event.target as HTMLSelectElement).value).run()"
      >
        <option v-for="f in FONTS" :key="f.label" :value="f.value">{{ f.label }}</option>
      </select>
      <select
        class="doc-select w-16"
        title="Size"
        @change="editor.chain().focus().setFontSize(($event.target as HTMLSelectElement).value).run()"
      >
        <option v-for="sz in SIZES" :key="sz" :value="sz">{{ sz.replace('pt', '') }}</option>
      </select>
      <select
        class="doc-select"
        title="Style"
        @change="
          ($event.target as HTMLSelectElement).value === 'p'
            ? editor.chain().focus().setParagraph().run()
            : editor.chain().focus().toggleHeading({ level: Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 3 }).run()
        "
      >
        <option value="p">Body</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
      </select>
      <span class="doc-sep" />

      <button
        v-for="t in marks"
        :key="t.label"
        class="doc-btn"
        :class="t.active?.() ? 'doc-btn-on' : ''"
        :title="t.label"
        @click="t.run()"
      >
        <component :is="t.icon" :size="15" />
      </button>
      <span class="doc-sep" />

      <!-- colour + highlight -->
      <div class="relative">
        <button class="doc-btn" title="Text colour" @click="showColor = !showColor">
          <Baseline :size="15" />
        </button>
        <div
          v-if="showColor"
          class="absolute left-0 top-full z-40 mt-1 w-44 rounded-xl border border-border bg-surface p-2 shadow-xl"
        >
          <p class="mb-1 text-[10px] uppercase tracking-wide text-ink-dim">Text</p>
          <div class="mb-2 flex gap-1">
            <button
              v-for="c in COLORS"
              :key="c"
              class="h-5 w-5 rounded-full border border-border"
              :style="{ background: c }"
              @click="editor.chain().focus().setColor(c).run(); showColor = false"
            />
          </div>
          <p class="mb-1 text-[10px] uppercase tracking-wide text-ink-dim">Highlight</p>
          <div class="flex gap-1">
            <button
              v-for="c in HIGHLIGHTS"
              :key="c"
              class="h-5 w-5 rounded-full border border-border"
              :style="{ background: c }"
              @click="editor.chain().focus().toggleHighlight({ color: c }).run(); showColor = false"
            />
          </div>
          <button
            class="mt-2 w-full rounded-lg border border-border py-1 text-[11px] text-ink-dim hover:text-ink"
            @click="editor.chain().focus().unsetColor().unsetHighlight().run(); showColor = false"
          >
            Clear colours
          </button>
        </div>
      </div>
      <button
        class="doc-btn"
        :class="editor.isActive('highlight') ? 'doc-btn-on' : ''"
        title="Highlight"
        @click="editor.chain().focus().toggleHighlight({ color: HIGHLIGHTS[0] }).run()"
      >
        <Highlighter :size="15" />
      </button>
      <select
        class="doc-select"
        title="Line spacing"
        @change="editor.chain().focus().setLineHeight(($event.target as HTMLSelectElement).value).run()"
      >
        <option v-for="lh in LINE_HEIGHTS" :key="lh.value" :value="lh.value">{{ lh.label }}</option>
      </select>
      <span class="doc-sep" />

      <button
        v-for="t in aligns"
        :key="t.label"
        class="doc-btn"
        :class="t.active?.() ? 'doc-btn-on' : ''"
        :title="t.label"
        @click="t.run()"
      >
        <component :is="t.icon" :size="15" />
      </button>
      <span class="doc-sep" />

      <button
        v-for="t in blocks"
        :key="t.label"
        class="doc-btn"
        :class="t.active?.() ? 'doc-btn-on' : ''"
        :title="t.label"
        @click="t.run()"
      >
        <component :is="t.icon" :size="15" />
      </button>
      <button
        class="doc-btn"
        title="Clear formatting"
        @click="editor.chain().focus().unsetAllMarks().clearNodes().run()"
      >
        <RemoveFormatting :size="15" />
      </button>
    </div>

    <!-- INSERT -->
    <div
      v-if="editor && ribbonTab === 'insert'"
      class="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2/60 px-3 py-1.5"
    >
      <button class="doc-btn" title="Insert table" @click="insertTable">
        <TableIcon :size="15" /> <span class="ml-1 text-xs">Table</span>
      </button>
      <button class="doc-btn" title="Insert image" @click="insertImage">
        <ImagePlus :size="15" /> <span class="ml-1 text-xs">Image</span>
      </button>
      <button
        class="doc-btn"
        :class="editor.isActive('link') ? 'doc-btn-on' : ''"
        title="Insert link"
        @click="setLink"
      >
        <Link2 :size="15" /> <span class="ml-1 text-xs">Link</span>
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" title="Insert page break" @click="editor.chain().focus().setPageBreak().run()">
        <FileStack :size="15" /> <span class="ml-1 text-xs">Page break</span>
      </button>
      <button
        class="doc-btn"
        title="Horizontal rule"
        @click="editor.chain().focus().setHorizontalRule().run()"
      >
        <Minus :size="15" /> <span class="ml-1 text-xs">Divider</span>
      </button>
      <span class="doc-sep" />
      <span class="flex items-center gap-1 text-xs text-ink-dim"><BookOpen :size="13" /> Cover page:</span>
      <button
        v-for="c in COVERS"
        :key="c.key"
        class="doc-btn text-xs"
        :title="`Insert a ${c.label.toLowerCase()} cover page`"
        @click="insertCover(c.key)"
      >
        {{ c.label }}
      </button>
    </div>

    <!-- LAYOUT -->
    <div
      v-if="editor && ribbonTab === 'layout'"
      class="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/60 px-3 py-1.5"
    >
      <span class="flex items-center gap-1 text-xs text-ink-dim"><ScrollText :size="13" /> View:</span>
      <div class="flex items-center gap-1 rounded-lg bg-surface p-0.5">
        <button
          class="rounded-md px-2 py-1 text-xs transition-colors"
          :class="prefs.pageView === 'paged' ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:text-ink'"
          title="Show where pages end"
          @click="prefs.setPageView('paged')"
        >
          Paged
        </button>
        <button
          class="rounded-md px-2 py-1 text-xs transition-colors"
          :class="prefs.pageView === 'continuous' ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:text-ink'"
          title="One continuous surface"
          @click="prefs.setPageView('continuous')"
        >
          Continuous
        </button>
      </div>
      <span class="doc-sep" />
      <span class="flex items-center gap-1 text-xs text-ink-dim"><FileDown :size="13" /> Zoom:</span>
      <button class="doc-btn" title="Zoom out" @click="zoom = Math.max(50, zoom - 10)">
        <Minus :size="14" />
      </button>
      <span class="w-10 text-center text-xs tabular-nums">{{ zoom }}%</span>
      <button class="doc-btn" title="Zoom in" @click="zoom = Math.min(200, zoom + 10)">
        <Plus :size="14" />
      </button>
      <p class="ml-auto max-w-xs text-[10px] leading-tight text-ink-dim">
        Paged view marks where each page ends. Text still flows across the line — insert a page
        break to force content onto the next page.
      </p>
    </div>

    <!-- contextual: table -->
    <div
      v-if="editor && inTable"
      class="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2/60 px-3 py-1.5 text-xs"
    >
      <span class="mr-1 flex items-center gap-1 text-ink-dim"><TableIcon :size="13" /> Table</span>
      <button class="doc-btn" title="Row above" @click="editor.chain().focus().addRowBefore().run()">
        <Rows3 :size="14" />+
      </button>
      <button class="doc-btn" title="Row below" @click="editor.chain().focus().addRowAfter().run()">
        +<Rows3 :size="14" />
      </button>
      <button class="doc-btn" title="Delete row" @click="editor.chain().focus().deleteRow().run()">
        <Rows3 :size="14" />−
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" title="Column before" @click="editor.chain().focus().addColumnBefore().run()">
        <Columns3 :size="14" />+
      </button>
      <button class="doc-btn" title="Column after" @click="editor.chain().focus().addColumnAfter().run()">
        +<Columns3 :size="14" />
      </button>
      <button class="doc-btn" title="Delete column" @click="editor.chain().focus().deleteColumn().run()">
        <Columns3 :size="14" />−
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" title="Toggle header row" @click="editor.chain().focus().toggleHeaderRow().run()">
        Header
      </button>
      <button class="doc-btn" title="Merge cells" @click="editor.chain().focus().mergeCells().run()">
        Merge
      </button>
      <button class="doc-btn" title="Split cell" @click="editor.chain().focus().splitCell().run()">
        Split
      </button>
      <button
        class="doc-btn ml-auto hover:text-red-400"
        title="Delete table"
        @click="editor.chain().focus().deleteTable().run()"
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <!-- contextual: image -->
    <div
      v-if="editor && onImage"
      class="flex items-center gap-1 border-b border-border bg-surface-2/60 px-3 py-1.5 text-xs"
    >
      <span class="mr-1 flex items-center gap-1 text-ink-dim"><ImagePlus :size="13" /> Image</span>
      <button class="doc-btn" title="Quarter width" @click="setImageWidth('25%')">25%</button>
      <button class="doc-btn" title="Half width" @click="setImageWidth('50%')">50%</button>
      <button class="doc-btn" title="Three quarters" @click="setImageWidth('75%')">75%</button>
      <button class="doc-btn" title="Full width" @click="setImageWidth('100%')">Full</button>
      <button class="doc-btn" title="Natural size" @click="setImageWidth(null)">Auto</button>
      <button
        class="doc-btn ml-auto hover:text-red-400"
        title="Delete image"
        @click="editor.chain().focus().deleteSelection().run()"
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <!-- page -->
    <div class="flex-1 overflow-auto bg-surface-2/50 py-8">
      <div class="cypher-page mx-auto" :style="{ zoom: zoom / 100 }">
        <EditorContent :editor="editor" :class="prefs.pageView === 'paged' ? 'paged' : ''" />
      </div>
    </div>

    <!-- status bar -->
    <div class="flex items-center gap-4 border-t border-border bg-surface px-4 py-1.5 text-xs text-ink-dim">
      <span class="tabular-nums">{{ wordCount.toLocaleString() }} words</span>
      <span class="tabular-nums">{{ charCount.toLocaleString() }} characters</span>
      <div class="ml-auto flex items-center gap-1">
        <button class="doc-btn" title="Zoom out" @click="zoom = Math.max(50, zoom - 10)">
          <Minus :size="13" />
        </button>
        <span class="w-10 text-center tabular-nums">{{ zoom }}%</span>
        <button class="doc-btn" title="Zoom in" @click="zoom = Math.min(200, zoom + 10)">
          <Plus :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>
