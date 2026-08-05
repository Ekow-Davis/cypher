<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Share2,
  Plus,
  Download,
  Trash2,
  EyeOff,
  Eye,
  Check,
  AlertCircle,
  ListChecks,
  Loader2,
  CalendarClock,
  Pencil,
  RefreshCw,
  Globe,
  Link2,
  CloudUpload
} from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import type { ShareLink, ShareScope, ChapterStatus } from '@shared/types'

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ close: [] }>()

const chapters = useChaptersStore()

const links = ref<ShareLink[]>([])
const creating = ref(false)
/** Set while editing an existing link; null while creating a new one. */
const editingId = ref<number | null>(null)
const busy = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)
/** Public URLs keyed by share id, present only when a server is configured. */
const urls = ref<Record<number, string>>({})
const copiedId = ref<number | null>(null)

async function loadUrls(): Promise<void> {
  for (const link of links.value) {
    const url = await window.cypher.share.url(link.id)
    if (url) urls.value = { ...urls.value, [link.id]: url }
  }
}

async function publish(link: ShareLink): Promise<void> {
  busy.value = true
  message.value = null
  error.value = null
  try {
    const res = await window.cypher.share.publish(link.id)
    if (!res.ok) error.value = res.error ?? 'Could not publish.'
    else {
      message.value = 'Published — readers on this link now see your latest text.'
      if (res.url) urls.value = { ...urls.value, [link.id]: res.url }
      await load()
    }
  } finally {
    busy.value = false
  }
}

async function copyUrl(link: ShareLink): Promise<void> {
  const url = urls.value[link.id]
  if (!url) return
  await navigator.clipboard.writeText(url)
  copiedId.value = link.id
  setTimeout(() => (copiedId.value = null), 1800)
}

const label = ref('')
const wholeBook = ref(true)
const includeCover = ref(true)
const includeSynopsis = ref(false)
const expiresAt = ref('')
const selected = ref<Set<number>>(new Set())

const STATUSES: ChapterStatus[] = ['outline', 'draft', 'revised', 'final']

/**
 * Chapters in manuscript order, so the list matches what a reader would see.
 * The store keeps them ordered by volume then position already; sorting here
 * is defensive against a refresh landing mid-render.
 */
const ordered = computed(() =>
  [...chapters.chapters].sort((a, b) => a.sort_order - b.sort_order)
)

const scope = computed<ShareScope>(() => ({
  chapterIds: wholeBook.value ? [] : [...selected.value],
  includeCover: includeCover.value,
  includeSynopsis: includeSynopsis.value
}))

const willShare = computed(() =>
  wholeBook.value ? ordered.value.length : selected.value.size
)

function toggle(id: number): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function selectByStatus(status: ChapterStatus): void {
  selected.value = new Set(
    ordered.value.filter((c) => c.status === status).map((c) => c.id)
  )
  wholeBook.value = false
}
function selectAll(): void {
  selected.value = new Set(ordered.value.map((c) => c.id))
}
function selectNone(): void {
  selected.value = new Set()
}

async function load(): Promise<void> {
  try {
    links.value = await window.cypher.share.list(props.bookId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function resetForm(): void {
  label.value = ''
  expiresAt.value = ''
  wholeBook.value = true
  includeCover.value = true
  includeSynopsis.value = false
  selectAll()
}

/** Loads an existing link back into the form so its scope can be changed. */
function startEdit(link: ShareLink): void {
  editingId.value = link.id
  creating.value = true
  label.value = link.label
  expiresAt.value = link.expires_at ? link.expires_at.slice(0, 10) : ''
  try {
    const s = JSON.parse(link.scope_json) as ShareScope
    wholeBook.value = s.chapterIds.length === 0
    selected.value = new Set(s.chapterIds)
    includeCover.value = s.includeCover
    includeSynopsis.value = s.includeSynopsis
  } catch {
    resetForm()
  }
}

function cancelForm(): void {
  creating.value = false
  editingId.value = null
  resetForm()
}

async function save(): Promise<void> {
  error.value = null
  if (!willShare.value) {
    error.value = 'Select at least one chapter.'
    return
  }
  busy.value = true
  try {
    const expires = expiresAt.value ? new Date(expiresAt.value).toISOString() : null
    if (editingId.value !== null) {
      // Editing keeps the token, so a URL already handed out keeps working.
      const updated = await window.cypher.share.update(editingId.value, {
        label: label.value,
        scope: scope.value,
        expiresAt: expires
      })
      if (updated) {
        const existing = links.value.find((l) => l.id === updated.id)
        if (existing) Object.assign(existing, updated)
      }
    } else {
      const created = await window.cypher.share.create({
        bookId: props.bookId,
        label: label.value,
        scope: scope.value,
        expiresAt: expires
      })
      links.value.unshift(created)
    }
    cancelForm()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function exportFile(link: ShareLink): Promise<void> {
  busy.value = true
  message.value = null
  error.value = null
  try {
    const res = await window.cypher.share.exportFile(link.id)
    if (res.cancelled) return
    if (res.error) error.value = res.error
    else {
      message.value = `Saved ${res.chapters} chapter${res.chapters === 1 ? '' : 's'} to ${res.path}`
      await load()
    }
  } finally {
    busy.value = false
  }
}

async function toggleActive(link: ShareLink): Promise<void> {
  if (link.active) {
    // Revoke on the server too, or the URL would keep serving.
    const res = await window.cypher.share.unpublish(link.id)
    if (!res.ok && res.error) error.value = res.error
  } else {
    await window.cypher.share.setActive(link.id, true)
  }
  await load()
}

async function remove(link: ShareLink): Promise<void> {
  await window.cypher.share.remove(link.id)
  links.value = links.value.filter((l) => l.id !== link.id)
}

function scopeLabel(link: ShareLink): string {
  try {
    const s = JSON.parse(link.scope_json) as ShareScope
    return s.chapterIds.length ? `${s.chapterIds.length} chapters` : 'Whole book'
  } catch {
    return 'Unknown scope'
  }
}
function publishedLabel(link: ShareLink): string {
  if (!link.last_published_at) return 'Never saved'
  const when = new Date(link.last_published_at.replace(' ', 'T') + 'Z')
  return `Saved ${when.toLocaleDateString()}`
}

function expiryLabel(link: ShareLink): string {
  if (!link.expires_at) return 'No expiry'
  const when = new Date(link.expires_at)
  return when.getTime() < Date.now()
    ? `Expired ${when.toLocaleDateString()}`
    : `Until ${when.toLocaleDateString()}`
}

onMounted(async () => {
  await load()
  await loadUrls()
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface">
      <div class="flex items-center gap-2 border-b border-border px-6 py-4">
        <Share2 :size="18" class="text-accent" />
        <div>
          <h2 class="text-lg font-bold">Share this book</h2>
          <p class="text-sm text-ink-dim">
            Read-only links. Update a page after edits — no need to send a new one.
          </p>
        </div>
      </div>

      <div class="flex-1 space-y-4 overflow-auto px-6 py-4">
        <!-- existing links -->
        <div v-if="links.length" class="space-y-2">
          <div
            v-for="link in links"
            :key="link.id"
            class="rounded-xl border border-border p-3"
            :class="link.active ? '' : 'opacity-60'"
          >
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ link.label }}</span>
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                :class="link.active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-dim'"
              >
                {{ link.active ? 'Active' : 'Revoked' }}
              </span>
            </div>
            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-dim">
              <span>{{ scopeLabel(link) }}</span>
              <span>{{ expiryLabel(link) }}</span>
              <span>{{ publishedLabel(link) }}</span>
              <span v-if="link.views">{{ link.views }} view{{ link.views === 1 ? '' : 's' }}</span>
            </div>
            <div class="mt-2 flex gap-1">
              <button
                class="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-dim hover:text-ink disabled:opacity-50"
                :disabled="busy"
                :title="link.last_published_at
                  ? 'Re-save with your latest text'
                  : 'Save as a standalone web page'"
                @click="exportFile(link)"
              >
                <component :is="link.last_published_at ? RefreshCw : Download" :size="13" />
                {{ link.last_published_at ? 'Update page' : 'Save page' }}
              </button>
              <button
                class="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-dim hover:text-ink disabled:opacity-50"
                :disabled="busy"
                :title="urls[link.id] ? 'Push your latest text to this link' : 'Publish online'"
                @click="publish(link)"
              >
                <component :is="urls[link.id] ? CloudUpload : Globe" :size="13" />
                {{ urls[link.id] ? 'Update online' : 'Publish' }}
              </button>
              <button
                v-if="urls[link.id]"
                class="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-dim hover:text-ink"
                title="Copy the reader link"
                @click="copyUrl(link)"
              >
                <component :is="copiedId === link.id ? Check : Link2" :size="13" />
                {{ copiedId === link.id ? 'Copied' : 'Copy link' }}
              </button>
              <button
                class="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-dim hover:text-ink"
                title="Change which chapters this link includes"
                @click="startEdit(link)"
              >
                <Pencil :size="13" /> Edit
              </button>
              <button
                class="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-dim hover:text-ink"
                :title="link.active ? 'Revoke this link' : 'Make active again'"
                @click="toggleActive(link)"
              >
                <component :is="link.active ? EyeOff : Eye" :size="13" />
                {{ link.active ? 'Revoke' : 'Restore' }}
              </button>
              <button
                class="ml-auto rounded-lg p-1 text-ink-dim hover:text-red-400"
                title="Delete link"
                @click="remove(link)"
              >
                <Trash2 :size="13" />
              </button>
            </div>
          </div>
        </div>
        <p v-else-if="!creating" class="rounded-xl border border-dashed border-border p-4 text-center text-xs text-ink-dim">
          No links yet.
        </p>

        <!-- create -->
        <button
          v-if="!creating"
          class="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-sm font-semibold text-on-accent"
          @click="creating = true; editingId = null; resetForm()"
        >
          <Plus :size="15" /> New link
        </button>

        <div v-else class="space-y-3 rounded-xl border border-border p-3">
          <input
            v-model="label"
            placeholder="Label (e.g. For my beta readers)"
            class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
          />

          <div class="grid grid-cols-2 gap-1">
            <button
              class="rounded-xl border px-3 py-2 text-left text-sm"
              :class="wholeBook ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'"
              @click="wholeBook = true"
            >
              Whole book
            </button>
            <button
              class="rounded-xl border px-3 py-2 text-left text-sm"
              :class="!wholeBook ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'"
              @click="wholeBook = false"
            >
              Selected chapters
            </button>
          </div>

          <div v-if="!wholeBook">
            <div class="mb-2 flex flex-wrap items-center gap-1">
              <ListChecks :size="14" class="text-accent" />
              <button
                v-for="s in STATUSES"
                :key="s"
                class="rounded-lg border border-border px-2 py-1 text-xs capitalize text-ink-dim hover:text-ink"
                :title="`Select every ${s} chapter`"
                @click="selectByStatus(s)"
              >
                {{ s }}
              </button>
              <button class="ml-auto rounded-lg px-2 py-1 text-xs text-ink-dim hover:text-ink" @click="selectAll">All</button>
              <button class="rounded-lg px-2 py-1 text-xs text-ink-dim hover:text-ink" @click="selectNone">None</button>
            </div>
            <div class="max-h-44 overflow-auto rounded-xl border border-border">
              <label
                v-for="c in ordered"
                :key="c.id"
                class="flex cursor-pointer items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0 hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 shrink-0"
                  style="accent-color: var(--color-accent)"
                  :checked="selected.has(c.id)"
                  @change="toggle(c.id)"
                />
                <span class="min-w-0 flex-1 truncate">{{ c.title }}</span>
                <span class="shrink-0 text-[10px] capitalize text-ink-dim">{{ c.status }}</span>
              </label>
            </div>
          </div>

          <div>
            <label class="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">
              <CalendarClock :size="13" /> Expires (optional)
            </label>
            <input
              v-model="expiresAt"
              type="date"
              class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
            />
          </div>

          <label class="flex items-center gap-2 text-sm">
            <input v-model="includeCover" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Include cover
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="includeSynopsis" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Include chapter synopses
          </label>

          <div class="flex items-center gap-2">
            <span class="text-xs text-ink-dim">{{ willShare }} chapter{{ willShare === 1 ? '' : 's' }}</span>
            <button class="ml-auto rounded-lg px-3 py-1.5 text-sm text-ink-dim hover:text-ink" @click="cancelForm">
              Cancel
            </button>
            <button
              class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-60"
              :disabled="busy || !willShare"
              @click="save"
            >
              <Loader2 v-if="busy" :size="14" class="animate-spin" />
              {{ editingId !== null ? 'Save changes' : 'Create' }}
            </button>
          </div>
        </div>

        <p v-if="message" class="flex items-start gap-2 break-all rounded-lg bg-accent-soft px-3 py-2 text-xs">
          <Check :size="14" class="mt-0.5 shrink-0 text-accent" />{{ message }}
        </p>
        <p v-if="error" class="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
        </p>
      </div>

      <div class="flex justify-end border-t border-border px-6 py-4">
        <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="emit('close')">
          Close
        </button>
      </div>
    </div>
  </div>
</template>
