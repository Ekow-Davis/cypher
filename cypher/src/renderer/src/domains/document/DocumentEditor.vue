<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  type Component
} from 'vue'
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
  Printer,
  FileSearch,
  Search,
  ChevronUp,
  ChevronDown,
  Replace,
  FolderOpen,
  FileType,
  Save,
  ListTree,
  RefreshCw,
  PanelLeft,
  Heading,
  StickyNote,
  MessageSquare,
  Link as LinkIcon,
  Image as ImageIconRef,
  ListOrdered as ListOrderedRef,
  Check as CheckIcon,
  Trash2 as TrashIcon,
  AlignLeft as AlignLeftIcon,
  AlignCenter as AlignCenterIcon,
  AlignRight as AlignRightIcon,
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
import { useFontsStore } from '@/stores/fonts'
import type { DocComment, RunningAlign } from '@shared/types'
import { assetUrl } from '@/lib/assets'
import { Pagination, remeasureHook, type PageLayout } from '@/lib/pagination'
import { FindReplace, findKey, findMatches, type Match } from '@/lib/findReplace'
import { TableOfContents, type TocEntry } from '@/lib/toc'
import { Footnote } from '@/lib/footnote'
import { CommentMark, findCommentPos } from '@/lib/comment'
import {
  CrossReference,
  Caption,
  HeadingRefId,
  collectReferenceables,
  displayFor,
  newId,
  type Referenceable
} from '@/lib/crossref'
import PrintPreview from './PrintPreview.vue'
import PromptDialog from '@/components/PromptDialog.vue'

const route = useRoute()
const router = useRouter()
const store = useDocumentsStore()
const prefs = usePreferencesStore()
const fontsStore = useFontsStore()

const id = Number(route.params.id)
type SaveStatus = 'saved' | 'saving' | 'unsaved'
const status = ref<SaveStatus>('saved')
const title = ref('')
const zoom = ref(100)
const showColor = ref(false)

const prompt = ref<{
  open: boolean
  title: string
  value: string
  placeholder: string
  multiline: boolean
  confirmLabel: string
}>({ open: false, title: '', value: '', placeholder: '', multiline: false, confirmLabel: 'Save' })
let promptResolve: ((value: string | null) => void) | null = null

/** Promise-based stand-in for window.prompt, which Electron disables. */
function ask(options: {
  title: string
  value?: string
  placeholder?: string
  multiline?: boolean
  confirmLabel?: string
}): Promise<string | null> {
  prompt.value = {
    open: true,
    title: options.title,
    value: options.value ?? '',
    placeholder: options.placeholder ?? '',
    multiline: options.multiline ?? false,
    confirmLabel: options.confirmLabel ?? 'Save'
  }
  return new Promise((resolve) => (promptResolve = resolve))
}
function onPromptSubmit(value: string): void {
  prompt.value.open = false
  promptResolve?.(value)
  promptResolve = null
}
function onPromptCancel(): void {
  prompt.value.open = false
  promptResolve?.(null)
  promptResolve = null
}
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

const BUILTIN_FONTS = [
  { label: 'Default', value: '' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Candara, sans-serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' }
]

/** Built-ins plus whatever the user has added in Settings. */
const FONTS = computed(() => [
  ...BUILTIN_FONTS,
  ...fontsStore.library.map((f) => ({ label: f.family, value: `'${f.family}'` }))
])
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
    HeadingRefId,
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
    // reads prefs live, so toggling the view re-paginates without a reload
    Pagination.configure({
      enabled: () => prefs.pageView === 'paged',
      onLayout: (l: PageLayout) => {
        layout.value = l
        pageCount.value = l.pages
        void nextTick(measureNotes)
      },
      noteHeight: (page: number) => noteHeights.get(page) ?? 0
    }),
    FindReplace,
    TableOfContents,
    Footnote,
    CommentMark,
    CrossReference,
    Caption,
    SizedImage.configure({ inline: false, allowBase64: true }),
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
  header.value = doc.header ?? ''
  footer.value = doc.footer ?? ''
  headerAlign.value = (doc.header_align as RunningAlign) ?? 'center'
  footerAlign.value = (doc.footer_align as RunningAlign) ?? 'center'
  void loadComments()
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

  // A document created by importing arrives with its HTML parked for us.
  const pending = sessionStorage.getItem('cypher:pendingImport')
  if (pending && route.query.importHtml) {
    sessionStorage.removeItem('cypher:pendingImport')
    editor.value.commands.setContent(pending)
    void saveNow()
  }
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

async function setLink(): Promise<void> {
  const previous = editor.value?.getAttributes('link').href ?? ''
  const url = await ask({
    title: 'Link URL',
    value: previous,
    placeholder: 'https://…',
    confirmLabel: 'Apply'
  })
  if (url === null) return
  if (url === '') {
    editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

type RibbonTab = 'file' | 'home' | 'insert' | 'references' | 'layout'
const ribbonTab = ref<RibbonTab>('home')
const RIBBON_TABS: { key: RibbonTab; label: string }[] = [
  { key: 'file', label: 'File' },
  { key: 'home', label: 'Home' },
  { key: 'insert', label: 'Insert' },
  { key: 'references', label: 'References' },
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

const printing = ref(false)
const busyFile = ref(false)
const showOutline = ref(false)
const header = ref('')
const footer = ref('')
const headerAlign = ref<RunningAlign>('center')
const footerAlign = ref<RunningAlign>('center')
const ALIGNS: { key: RunningAlign; icon: typeof AlignLeftIcon }[] = [
  { key: 'left', icon: AlignLeftIcon },
  { key: 'center', icon: AlignCenterIcon },
  { key: 'right', icon: AlignRightIcon }
]
let metaTimer: ReturnType<typeof setTimeout> | null = null
const showNotes = ref(false)
const showComments = ref(false)
const showRefPicker = ref(false)
const refQuery = ref('')

const referenceables = computed<Referenceable[]>(() => {
  const ed = editor.value
  if (!ed) return []
  return collectReferenceables(ed.state.doc)
})
const filteredRefs = computed(() => {
  const q = refQuery.value.trim().toLowerCase()
  if (!q) return referenceables.value
  return referenceables.value.filter(
    (r) => r.label.toLowerCase().includes(q) || displayFor(r).toLowerCase().includes(q)
  )
})

function insertReference(ref: Referenceable): void {
  editor.value?.chain().focus().insertCrossReference(ref.id, ref.kind, displayFor(ref)).run()
  showRefPicker.value = false
  refQuery.value = ''
}

/**
 * Re-resolves every cross-reference's displayed text against the current
 * numbering. Run on demand — like the table of contents — rather than on every
 * keystroke, which would fight the paginator that's already re-measuring.
 */
function refreshReferences(): void {
  const ed = editor.value
  if (!ed) return
  const byId = new Map(referenceables.value.map((r) => [r.id, r]))
  const tr = ed.state.tr
  let changed = false
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'crossref') return
    const target = byId.get(node.attrs.targetId)
    const display = target ? displayFor(target) : '(missing)'
    if (display !== node.attrs.display) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, display })
      changed = true
    }
  })
  if (changed) ed.view.dispatch(tr)
}

function insertCaption(kind: 'figure' | 'table'): void {
  editor.value?.chain().focus().insertCaption(kind, newId(kind)).run()
}
const comments = ref<DocComment[]>([])

async function loadComments(): Promise<void> {
  if (loadedId == null) return
  try {
    comments.value = await window.cypher.comments.list(loadedId)
  } catch {
    comments.value = []
  }
}

const openComments = computed(() => comments.value.filter((c) => !c.resolved))
const resolvedComments = computed(() => comments.value.filter((c) => c.resolved))

async function addComment(): Promise<void> {
  const ed = editor.value
  if (!ed || loadedId == null) return
  const { from, to } = ed.state.selection
  if (from === to) {
    notify('Select some text to comment on.')
    return
  }
  const body = await ask({
    title: 'New comment',
    placeholder: 'What needs changing?',
    multiline: true,
    confirmLabel: 'Comment'
  })
  if (body === null || !body.trim()) return

  const anchor = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const created = await window.cypher.comments.create({
    documentId: loadedId,
    anchor,
    author: prefs.defaultAuthor || 'You',
    body: body.trim(),
    quote: ed.state.doc.textBetween(from, to, ' ').slice(0, 200)
  })
  ed.chain().focus().setComment(anchor).run()
  comments.value.push(created)
  showComments.value = true
  await saveNow()
}

async function toggleResolved(comment: DocComment): Promise<void> {
  const next = !comment.resolved
  const updated = await window.cypher.comments.resolve(comment.id, next)
  if (updated) Object.assign(comment, updated)
  editor.value?.chain().focus().markCommentResolved(comment.anchor, next).run()
  await saveNow()
}

async function removeComment(comment: DocComment): Promise<void> {
  await window.cypher.comments.remove(comment.id)
  comments.value = comments.value.filter((c) => c.id !== comment.id)
  editor.value?.chain().focus().unsetComment(comment.anchor).run()
  await saveNow()
}

function goToComment(comment: DocComment): void {
  const ed = editor.value
  if (!ed) return
  const pos = findCommentPos(ed.state, comment.anchor)
  if (pos == null) return
  ed.chain().focus().setTextSelection(pos + 1).run()
  const dom = ed.view.domAtPos(pos).node as HTMLElement
  const el = dom.nodeType === 1 ? dom : dom.parentElement
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}

function fmtWhen(iso: string): string {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString()
}

/** Notes belonging at the foot of a given page. */
function notesForPage(page: number): NoteItem[] {
  const entry = layout.value.notes.find((n) => n.page === page)
  if (!entry) return []
  return entry.notes
    .map((num) => footnotes.value[num - 1])
    .filter((n): n is NoteItem => Boolean(n))
}

/**
 * Measures each page's rendered note block and, if it differs from what the
 * paginator reserved, asks for another pass. Comparing before re-running is
 * what stops the reserve/reflow cycle from oscillating forever.
 */
function measureNotes(): void {
  let changed = false
  for (const [page, el] of Object.entries(noteRefs.value)) {
    if (!el) continue
    const measured = el.getBoundingClientRect().height
    const known = noteHeights.get(Number(page)) ?? 0
    if (Math.abs(measured - known) > 1) {
      noteHeights.set(Number(page), measured)
      changed = true
    }
  }
  // Drop stale entries for pages that no longer carry notes.
  for (const page of [...noteHeights.keys()]) {
    if (!layout.value.notes.some((n) => n.page === page)) {
      noteHeights.delete(page)
      changed = true
    }
  }
  if (changed) remeasureHook.get('cypherPagination')?.()
}

interface NoteItem {
  pos: number
  index: number
  text: string
}

/** Footnotes in document order; the number is the order, never stored. */
const footnotes = computed<NoteItem[]>(() => {
  const ed = editor.value
  if (!ed) return []
  const out: NoteItem[] = []
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'footnote') return
    out.push({ pos, index: out.length + 1, text: String(node.attrs.text ?? '') })
  })
  return out
})

async function addFootnote(): Promise<void> {
  const text = await ask({
    title: 'Footnote text',
    placeholder: 'The note that appears at the foot of the page…',
    multiline: true,
    confirmLabel: 'Insert'
  })
  if (text === null) return
  editor.value?.chain().focus().insertFootnote(text.trim()).run()
  showNotes.value = true
}

async function editFootnote(note: NoteItem): Promise<void> {
  const text = await ask({ title: 'Edit footnote', value: note.text, multiline: true })
  if (text === null) return
  editor.value?.chain().focus().updateFootnote(note.pos, text.trim()).run()
}

function goToFootnote(note: NoteItem): void {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().setTextSelection(note.pos).run()
  const dom = ed.view.nodeDOM(note.pos)
  const el = dom instanceof HTMLElement ? dom : (dom as any)?.parentElement
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}

/** Fills {page}, {pages}, {title} and {date} for the on-screen sheets. */
function runningText(template: string, page: number): string {
  if (!template.trim()) return ''
  return template
    .replace(/\{page\}/g, String(page))
    .replace(/\{pages\}/g, String(pageCount.value))
    .replace(/\{title\}/g, title.value || 'Untitled document')
    .replace(/\{date\}/g, new Date().toLocaleDateString())
}

function scheduleMetaSave(): void {
  if (metaTimer) clearTimeout(metaTimer)
  metaTimer = setTimeout(() => {
    if (loadedId != null) {
      void store.saveMeta(loadedId, {
        header: header.value,
        footer: footer.value,
        header_align: headerAlign.value,
        footer_align: footerAlign.value
      })
    }
  }, 600)
}

interface Heading {
  offset: number
  level: number
  text: string
  page: number
}

/** Every heading in the document, with the page the paginator put it on. */
const headings = computed<Heading[]>(() => {
  const ed = editor.value
  if (!ed) return []
  const pageOf = new Map(layout.value.blocks.map((b) => [b.offset, b.page]))
  const out: Heading[] = []
  ed.state.doc.forEach((node, offset) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    if (!text) return
    out.push({
      offset,
      level: Number(node.attrs.level ?? 1),
      text,
      page: pageOf.get(offset) ?? 1
    })
  })
  return out
})

function tocEntries(): TocEntry[] {
  return headings.value.map((h) => ({ text: h.text, level: h.level, page: h.page }))
}

function insertToc(): void {
  editor.value?.chain().focus().insertTableOfContents(tocEntries()).run()
}

function refreshToc(): void {
  const ok = editor.value?.chain().focus().refreshTableOfContents(tocEntries()).run()
  if (!ok) insertToc()
  refreshReferences()
}

function goToHeading(h: Heading): void {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().setTextSelection(h.offset + 1).run()
  const dom = ed.view.nodeDOM(h.offset)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
const fileNotice = ref<string | null>(null)

function notify(message: string): void {
  fileNotice.value = message
  setTimeout(() => (fileNotice.value = null), 5000)
}

/** Replaces this document's body with an imported Word file. */
async function importDocx(): Promise<void> {
  busyFile.value = true
  try {
    const result = await window.cypher.docs.importDocx()
    if (!result) return
    editor.value?.commands.setContent(result.html)
    await saveNow()
    notify(
      result.warnings
        ? `Imported with ${result.warnings} formatting note(s) — check the result.`
        : 'Imported.'
    )
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e))
  } finally {
    busyFile.value = false
  }
}

async function exportAs(format: 'docx' | 'pdf'): Promise<void> {
  if (loadedId == null) return
  if (status.value !== 'saved') await saveNow()
  busyFile.value = true
  try {
    const res = await window.cypher.docs.exportAs(loadedId, format)
    if (res.cancelled) return
    notify(res.error ? res.error : `Saved to ${res.path}`)
  } finally {
    busyFile.value = false
  }
}
const showFind = ref(false)
const findQuery = ref('')
const replaceWith = ref('')
const caseSensitive = ref(false)
const matches = ref<Match[]>([])
const activeMatch = ref(0)

function pushMatches(): void {
  const ed = editor.value
  if (!ed) return
  ed.view.dispatch(
    ed.state.tr.setMeta(findKey, { matches: matches.value, active: activeMatch.value })
  )
}

function runFind(): void {
  const ed = editor.value
  if (!ed) return
  matches.value = findQuery.value ? findMatches(ed.state, findQuery.value, caseSensitive.value) : []
  activeMatch.value = 0
  pushMatches()
  scrollToMatch()
}

function scrollToMatch(): void {
  const ed = editor.value
  const hit = matches.value[activeMatch.value]
  if (!ed || !hit) return
  const dom = ed.view.domAtPos(hit.from).node as HTMLElement
  const el = dom.nodeType === 1 ? dom : dom.parentElement
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}

function stepMatch(delta: number): void {
  if (!matches.value.length) return
  activeMatch.value =
    (activeMatch.value + delta + matches.value.length) % matches.value.length
  pushMatches()
  scrollToMatch()
}

function replaceCurrent(): void {
  const ed = editor.value
  const hit = matches.value[activeMatch.value]
  if (!ed || !hit) return
  ed.chain().focus().insertContentAt({ from: hit.from, to: hit.to }, replaceWith.value).run()
  runFind()
}

/** Replaces from the end so earlier positions stay valid as the text shifts. */
function replaceAll(): void {
  const ed = editor.value
  if (!ed || !matches.value.length) return
  const chain = ed.chain().focus()
  for (const hit of [...matches.value].reverse()) {
    chain.insertContentAt({ from: hit.from, to: hit.to }, replaceWith.value)
  }
  chain.run()
  runFind()
}

function closeFind(): void {
  showFind.value = false
  matches.value = []
  pushMatches()
}
const pageCount = ref(1)
const layout = ref<PageLayout>({ pages: 1, blocks: [], notes: [], cycle: 0, sheet: 0 })
/** Measured height of each page's note block, fed back into the paginator. */
const noteHeights = new Map<number, number>()
const noteRefs = ref<Record<number, HTMLElement | null>>({})
const MARGIN_PRESETS = [
  { key: 'narrow', label: 'Narrow', inches: 0.6 },
  { key: 'normal', label: 'Normal', inches: 1 },
  { key: 'wide', label: 'Wide', inches: 1.3 }
] as const
const marginIn = computed(
  () => MARGIN_PRESETS.find((m) => m.key === prefs.pageMargin)?.inches ?? 1
)
const showPreview = ref(false)

async function openPreview(): Promise<void> {
  if (loadedId == null) return
  if (status.value !== 'saved') await saveNow()
  showPreview.value = true
}

async function printDocument(): Promise<void> {
  if (loadedId == null) return
  if (status.value !== 'saved') await saveNow()
  printing.value = true
  try {
    await window.cypher.printer.document(loadedId)
  } finally {
    printing.value = false
  }
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

watch(
  () => prefs.pageView,
  () => {
    // nudge the plugin so it re-runs against the new mode
    editor.value?.view.dispatch(editor.value.state.tr)
  }
)

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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    showFind.value = true
  }
  if (e.key === 'Escape' && showFind.value) closeFind()
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
  if (metaTimer) clearTimeout(metaTimer)
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

    <!-- FILE -->
    <div
      v-if="editor && ribbonTab === 'file'"
      class="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2/60 px-3 py-1.5"
    >
      <button class="doc-btn" :disabled="busyFile" title="Replace this document with a Word file" @click="importDocx">
        <FolderOpen :size="15" /> <span class="ml-1 text-xs">Import .docx</span>
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" :disabled="busyFile" title="Export as Word" @click="exportAs('docx')">
        <Save :size="15" /> <span class="ml-1 text-xs">Export Word</span>
      </button>
      <button class="doc-btn" :disabled="busyFile" title="Export as PDF" @click="exportAs('pdf')">
        <FileType :size="15" /> <span class="ml-1 text-xs">Export PDF</span>
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" title="Print preview" @click="openPreview">
        <FileSearch :size="15" /> <span class="ml-1 text-xs">Preview</span>
      </button>
      <button class="doc-btn" :disabled="printing" title="Print" @click="printDocument">
        <Printer :size="15" /> <span class="ml-1 text-xs">{{ printing ? 'Printing…' : 'Print' }}</span>
      </button>
      <span v-if="fileNotice" class="ml-auto max-w-sm truncate text-[11px] text-ink-dim">
        {{ fileNotice }}
      </span>
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
      <span class="doc-sep" />
      <button
        class="doc-btn"
        :class="showFind ? 'doc-btn-on' : ''"
        title="Find & replace (Ctrl+F)"
        @click="showFind ? closeFind() : (showFind = true)"
      >
        <Search :size="15" />
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
      <span class="flex items-center gap-1 text-xs text-ink-dim"><Heading :size="13" /> Header:</span>
      <input
        v-model="header"
        placeholder="e.g. {title}"
        class="w-36 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-line"
        @input="scheduleMetaSave"
      />
      <button
        v-for="a in ALIGNS"
        :key="`h-${a.key}`"
        class="doc-btn"
        :class="headerAlign === a.key ? 'doc-btn-on' : ''"
        :title="`Header ${a.key}`"
        @click="headerAlign = a.key; scheduleMetaSave()"
      >
        <component :is="a.icon" :size="13" />
      </button>
      <span class="text-xs text-ink-dim">Footer:</span>
      <input
        v-model="footer"
        placeholder="e.g. Page {page} of {pages}"
        class="w-40 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-line"
        @input="scheduleMetaSave"
      />
      <button
        v-for="a in ALIGNS"
        :key="`f-${a.key}`"
        class="doc-btn"
        :class="footerAlign === a.key ? 'doc-btn-on' : ''"
        :title="`Footer ${a.key}`"
        @click="footerAlign = a.key; scheduleMetaSave()"
      >
        <component :is="a.icon" :size="13" />
      </button>
      <span class="text-[10px] text-ink-dim">{page} {pages} {title} {date}</span>

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

    <!-- REFERENCES -->
    <div
      v-if="editor && ribbonTab === 'references'"
      class="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2/60 px-3 py-1.5"
    >
      <button class="doc-btn" title="Insert a table of contents here" @click="insertToc">
        <ListTree :size="15" /> <span class="ml-1 text-xs">Insert contents</span>
      </button>
      <button class="doc-btn" title="Update the table of contents" @click="refreshToc">
        <RefreshCw :size="15" /> <span class="ml-1 text-xs">Update</span>
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" title="Comment on the selected text" @click="addComment">
        <MessageSquare :size="15" /> <span class="ml-1 text-xs">Comment</span>
      </button>
      <button
        class="doc-btn"
        :class="showComments ? 'doc-btn-on' : ''"
        title="Show comments"
        @click="showComments = !showComments"
      >
        <MessageSquare :size="15" /> <span class="ml-1 text-xs">All ({{ openComments.length }})</span>
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" title="Insert a footnote here" @click="addFootnote">
        <StickyNote :size="15" /> <span class="ml-1 text-xs">Footnote</span>
      </button>
      <button
        class="doc-btn"
        :class="showNotes ? 'doc-btn-on' : ''"
        title="Show all footnotes"
        @click="showNotes = !showNotes"
      >
        <ListTree :size="15" /> <span class="ml-1 text-xs">Notes ({{ footnotes.length }})</span>
      </button>
      <span class="doc-sep" />
      <button
        class="doc-btn"
        :class="showOutline ? 'doc-btn-on' : ''"
        title="Show the document outline"
        @click="showOutline = !showOutline"
      >
        <PanelLeft :size="15" /> <span class="ml-1 text-xs">Navigation</span>
      </button>
      <span class="doc-sep" />
      <button class="doc-btn" title="Caption a figure above" @click="insertCaption('figure')">
        <ImageIconRef :size="15" /> <span class="ml-1 text-xs">Figure caption</span>
      </button>
      <button class="doc-btn" title="Caption a table above" @click="insertCaption('table')">
        <ListOrderedRef :size="15" /> <span class="ml-1 text-xs">Table caption</span>
      </button>
      <span class="doc-sep" />
      <button
        class="doc-btn"
        title="Insert a cross-reference — jumps and stays correct if things move"
        @click="showRefPicker = true"
      >
        <LinkIcon :size="15" /> <span class="ml-1 text-xs">Cross-reference</span>
      </button>
      <button class="doc-btn" title="Update all cross-references" @click="refreshReferences">
        <RefreshCw :size="15" /> <span class="ml-1 text-xs">Update refs</span>
      </button>
      <span class="ml-auto text-[10px] text-ink-dim">
        {{ headings.length }} heading{{ headings.length === 1 ? '' : 's' }} · page &amp; ref numbers
        update when you press Update
      </span>
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
      <span class="doc-sep" />
      <span class="text-xs text-ink-dim">Margins:</span>
      <div class="flex items-center gap-1 rounded-lg bg-surface p-0.5">
        <button
          v-for="m in MARGIN_PRESETS"
          :key="m.key"
          class="rounded-md px-2 py-1 text-xs transition-colors"
          :class="prefs.pageMargin === m.key ? 'bg-surface-2 text-accent' : 'text-ink-dim hover:text-ink'"
          :title="`${m.inches}in margins`"
          @click="prefs.setPageMargin(m.key)"
        >
          {{ m.label }}
        </button>
      </div>
      <span class="doc-sep" />
      <button class="doc-btn" title="Print preview" @click="openPreview">
        <FileSearch :size="15" /> <span class="ml-1 text-xs">Preview</span>
      </button>
      <button class="doc-btn" :disabled="printing" title="Print this document" @click="printDocument">
        <Printer :size="15" /> <span class="ml-1 text-xs">{{ printing ? 'Printing…' : 'Print' }}</span>
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
    <div class="flex min-h-0 flex-1">
      <aside
        v-if="showOutline"
        class="w-60 shrink-0 overflow-auto border-r border-border bg-surface py-2"
      >
        <div class="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">
          Navigation
        </div>
        <p v-if="!headings.length" class="px-4 py-3 text-xs text-ink-dim">
          Headings you add will appear here.
        </p>
        <button
          v-for="h in headings"
          :key="h.offset"
          class="flex w-full items-baseline gap-2 py-1 pr-3 text-left text-xs text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          :style="{ paddingLeft: 0.75 + (h.level - 1) * 0.7 + 'rem' }"
          @click="goToHeading(h)"
        >
          <span class="min-w-0 flex-1 truncate">{{ h.text }}</span>
          <span class="shrink-0 tabular-nums opacity-60">{{ h.page }}</span>
        </button>
      </aside>

      <div class="flex-1 overflow-auto bg-surface-2/50 py-8">
      <div
        class="doc-canvas mx-auto"
        :style="{ zoom: zoom / 100, '--doc-margin': marginIn + 'in' }"
      >
        <!-- measured, never shown; inside the canvas so zoom is accounted for -->
        <div class="m-page" aria-hidden="true" />
        <div class="m-margin" aria-hidden="true" />
        <div class="m-gap" aria-hidden="true" />

        <!-- the sheets themselves, floating on the desk behind the text -->
        <div class="doc-sheets" aria-hidden="true">
          <!-- Positioned from the same geometry the paginator uses, so a sheet
               edge can never drift away from where the text actually breaks. -->
          <template v-if="prefs.pageView === 'paged' && layout.cycle > 0">
            <div
              v-for="n in pageCount"
              :key="n"
              class="doc-sheet"
              :style="{ top: (n - 1) * layout.cycle + 'px', height: layout.sheet + 'px' }"
            >
              <div
                v-if="header"
                class="sheet-running sheet-header"
                :style="{ height: marginIn + 'in', justifyContent: headerAlign === 'left' ? 'flex-start' : headerAlign === 'right' ? 'flex-end' : 'center' }"
              >
                {{ runningText(header, n) }}
              </div>
              <div
                v-if="footer"
                class="sheet-running sheet-footer"
                :style="{ height: marginIn + 'in', justifyContent: footerAlign === 'left' ? 'flex-start' : footerAlign === 'right' ? 'flex-end' : 'center' }"
              >
                {{ runningText(footer, n) }}
              </div>
              <div
                v-if="notesForPage(n).length"
                :ref="(el) => (noteRefs[n] = el as HTMLElement | null)"
                class="sheet-notes"
                :style="{ bottom: marginIn + 'in', left: marginIn + 'in', right: marginIn + 'in' }"
              >
                <div v-for="note in notesForPage(n)" :key="note.pos" class="footnote-item">
                  <sup>{{ note.index }}</sup> {{ note.text || '(empty note)' }}
                </div>
              </div>
            </div>
          </template>
          <div v-else class="doc-sheet doc-sheet-fill" />
        </div>

        <EditorContent :editor="editor" class="doc-layer" />
        </div>
      </div>

      <aside
        v-if="showComments"
        class="w-72 shrink-0 overflow-auto border-l border-border bg-surface py-2"
      >
        <div class="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">
          Comments
        </div>
        <p v-if="!comments.length" class="px-4 py-3 text-xs text-ink-dim">
          Select text and press Comment to leave one.
        </p>

        <div
          v-for="c in [...openComments, ...resolvedComments]"
          :key="c.id"
          class="group mx-2 mb-2 rounded-lg border border-border p-2"
          :class="c.resolved ? 'opacity-55' : ''"
        >
          <div class="mb-1 flex items-center gap-2">
            <span class="truncate text-xs font-semibold">{{ c.author || 'You' }}</span>
            <span class="shrink-0 text-[10px] text-ink-dim">{{ fmtWhen(c.created_at) }}</span>
            <button
              class="ml-auto shrink-0 rounded p-0.5 text-ink-dim hover:text-accent"
              :title="c.resolved ? 'Reopen' : 'Resolve'"
              @click="toggleResolved(c)"
            >
              <CheckIcon :size="12" />
            </button>
            <button
              class="shrink-0 rounded p-0.5 text-ink-dim hover:text-red-400"
              title="Delete"
              @click="removeComment(c)"
            >
              <TrashIcon :size="12" />
            </button>
          </div>
          <p
            v-if="c.quote"
            class="mb-1 cursor-pointer truncate border-l-2 border-accent pl-2 text-[11px] italic text-ink-dim"
            @click="goToComment(c)"
          >
            {{ c.quote }}
          </p>
          <p class="text-xs">{{ c.body }}</p>
        </div>
      </aside>

      <aside
        v-if="showNotes"
        class="w-64 shrink-0 overflow-auto border-l border-border bg-surface py-2"
      >
        <div class="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">
          Footnotes
        </div>
        <p v-if="!footnotes.length" class="px-4 py-3 text-xs text-ink-dim">
          No footnotes yet. Place the cursor and press Footnote.
        </p>
        <div
          v-for="note in footnotes"
          :key="note.pos"
          class="group mx-2 mb-1 rounded-lg px-2 py-1.5 hover:bg-surface-2"
        >
          <div class="flex items-start gap-2">
            <span class="mt-0.5 shrink-0 text-[10px] font-semibold text-accent">{{ note.index }}</span>
            <button class="min-w-0 flex-1 text-left text-xs text-ink-dim" @click="goToFootnote(note)">
              {{ note.text || '(empty note)' }}
            </button>
            <button
              class="shrink-0 rounded p-0.5 text-ink-dim opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              title="Edit"
              @click="editFootnote(note)"
            >
              <Replace :size="12" />
            </button>
          </div>
        </div>
      </aside>
    </div>

    <!-- find & replace -->
    <div
      v-if="showFind"
      class="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/80 px-3 py-2 text-xs"
    >
      <Search :size="14" class="shrink-0 text-ink-dim" />
      <input
        v-model="findQuery"
        placeholder="Find"
        class="w-40 rounded-lg border border-border bg-surface px-2 py-1 outline-none focus:border-accent-line"
        @input="runFind"
        @keydown.enter.prevent="stepMatch(1)"
      />
      <span class="tabular-nums text-ink-dim">
        {{ matches.length ? `${activeMatch + 1} of ${matches.length}` : 'No results' }}
      </span>
      <button class="doc-btn" title="Previous" @click="stepMatch(-1)"><ChevronUp :size="14" /></button>
      <button class="doc-btn" title="Next" @click="stepMatch(1)"><ChevronDown :size="14" /></button>

      <span class="doc-sep" />
      <Replace :size="14" class="shrink-0 text-ink-dim" />
      <input
        v-model="replaceWith"
        placeholder="Replace with"
        class="w-40 rounded-lg border border-border bg-surface px-2 py-1 outline-none focus:border-accent-line"
      />
      <button class="doc-btn" :disabled="!matches.length" @click="replaceCurrent">Replace</button>
      <button class="doc-btn" :disabled="!matches.length" @click="replaceAll">All</button>

      <label class="ml-2 flex items-center gap-1.5">
        <input
          v-model="caseSensitive"
          type="checkbox"
          class="h-3.5 w-3.5"
          style="accent-color: var(--color-accent)"
          @change="runFind"
        />
        Match case
      </label>

      <button class="doc-btn ml-auto" title="Close (Esc)" @click="closeFind"><X :size="14" /></button>
    </div>

    <div
      v-if="showRefPicker"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      @click.self="showRefPicker = false"
    >
      <div class="flex max-h-[70vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface p-4 shadow-xl">
        <h2 class="mb-2 text-sm font-semibold">Insert cross-reference</h2>
        <input
          v-model="refQuery"
          placeholder="Search headings, figures, tables, notes…"
          class="mb-2 w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
        />
        <div class="flex-1 overflow-auto rounded-xl border border-border">
          <button
            v-for="ref in filteredRefs"
            :key="ref.id"
            class="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-2"
            @click="insertReference(ref)"
          >
            <span class="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {{ displayFor(ref) }}
            </span>
            <span class="min-w-0 flex-1 truncate text-ink-dim">{{ ref.label }}</span>
          </button>
          <p v-if="!filteredRefs.length" class="px-3 py-4 text-center text-xs text-ink-dim">
            Nothing to reference yet — add a heading, figure caption, table caption, or footnote.
          </p>
        </div>
        <button
          class="mt-2 rounded-lg px-3 py-1.5 text-xs text-ink-dim hover:text-ink"
          @click="showRefPicker = false"
        >
          Close
        </button>
      </div>
    </div>

    <PromptDialog
      :open="prompt.open"
      :title="prompt.title"
      :value="prompt.value"
      :placeholder="prompt.placeholder"
      :multiline="prompt.multiline"
      :confirm-label="prompt.confirmLabel"
      @submit="onPromptSubmit"
      @cancel="onPromptCancel"
    />

    <PrintPreview
      v-if="showPreview && loadedId !== null"
      :doc-id="loadedId"
      @close="showPreview = false"
    />

    <!-- status bar -->
    <div class="flex items-center gap-4 border-t border-border bg-surface px-4 py-1.5 text-xs text-ink-dim">
      <span class="tabular-nums">{{ wordCount.toLocaleString() }} words</span>
      <span class="tabular-nums">{{ charCount.toLocaleString() }} characters</span>
      <span v-if="prefs.pageView === 'paged'" class="tabular-nums">
        {{ pageCount }} page{{ pageCount === 1 ? '' : 's' }}
      </span>
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
