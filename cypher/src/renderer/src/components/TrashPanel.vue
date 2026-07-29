<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Trash2, RotateCcw, BookOpen, FileText, ScrollText, UserRound } from 'lucide-vue-next'
import type { TrashItem, TrashKind } from '@shared/types'

const items = ref<TrashItem[]>([])
const error = ref<string | null>(null)
const retention = ref(30)
const confirmEmpty = ref(false)
const confirmPurge = ref<TrashItem | null>(null)

const ICONS: Record<TrashKind, typeof BookOpen> = {
  book: BookOpen,
  chapter: FileText,
  lore: ScrollText,
  character: UserRound
}
const LABELS: Record<TrashKind, string> = {
  book: 'Book',
  chapter: 'Chapter',
  lore: 'Lore entry',
  character: 'Character'
}

async function refresh(): Promise<void> {
  try {
    items.value = await window.cypher.trash.list()
    const all = (await window.cypher.settings.getAll()) as Record<string, unknown>
    retention.value = Number(all.trashRetentionDays ?? 30)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function setRetention(): Promise<void> {
  await window.cypher.settings.set('trashRetentionDays', retention.value)
}

async function restore(item: TrashItem): Promise<void> {
  await window.cypher.trash.restore(item.kind, item.id)
  await refresh()
}
async function purge(): Promise<void> {
  if (!confirmPurge.value) return
  await window.cypher.trash.purge(confirmPurge.value.kind, confirmPurge.value.id)
  confirmPurge.value = null
  await refresh()
}
async function empty(): Promise<void> {
  await window.cypher.trash.empty()
  confirmEmpty.value = false
  await refresh()
}

function fmt(iso: string): string {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString()
}

const grouped = computed(() => {
  const order: TrashKind[] = ['book', 'chapter', 'lore', 'character']
  return order
    .map((kind) => ({ kind, items: items.value.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length)
})

onMounted(refresh)
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Trash2 :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Trash</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Deleted books, chapters, lore entries, and characters wait here so they can be brought back.
    </p>

    <p v-if="error" class="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{{ error }}</p>

    <div class="mb-4 flex items-center gap-2">
      <span class="text-xs text-ink-dim">Keep deleted items for</span>
      <input
        v-model.number="retention"
        type="number"
        min="0"
        max="365"
        class="w-20 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
        @change="setRetention"
      />
      <span class="text-xs text-ink-dim">days (0 = forever)</span>
      <button
        v-if="items.length"
        class="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-ink-dim hover:text-red-400"
        @click="confirmEmpty = true"
      >
        Empty trash
      </button>
    </div>

    <p v-if="!items.length" class="text-sm text-ink-dim">Trash is empty.</p>

    <div v-for="g in grouped" :key="g.kind" class="mb-4">
      <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
        {{ LABELS[g.kind] }}s ({{ g.items.length }})
      </div>
      <ul class="space-y-1">
        <li
          v-for="item in g.items"
          :key="`${item.kind}-${item.id}`"
          class="group flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-sm"
        >
          <component :is="ICONS[item.kind]" :size="14" class="shrink-0 text-ink-dim" />
          <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
          <span v-if="item.context" class="shrink-0 truncate text-[10px] text-ink-dim">
            {{ item.context }}
          </span>
          <span class="shrink-0 text-[10px] text-ink-dim">{{ fmt(item.deleted_at) }}</span>
          <button
            class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
            title="Restore"
            @click="restore(item)"
          >
            <RotateCcw :size="13" />
          </button>
          <button
            class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            title="Delete permanently"
            @click="confirmPurge = item"
          >
            <Trash2 :size="13" />
          </button>
        </li>
      </ul>
    </div>

    <!-- confirmations -->
    <div
      v-if="confirmPurge"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="confirmPurge = null"
    >
      <div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-2 text-lg font-bold">Delete permanently?</h2>
        <p class="mb-5 text-sm text-ink-dim">
          <span class="font-semibold text-ink">{{ confirmPurge.title }}</span> will be gone for good.
          <template v-if="confirmPurge.kind === 'book'">
            Everything inside it — chapters, lore, characters — goes too.
          </template>
        </p>
        <div class="flex justify-end gap-2">
          <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="confirmPurge = null">
            Cancel
          </button>
          <button class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90" @click="purge">
            Delete forever
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="confirmEmpty"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="confirmEmpty = false"
    >
      <div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-2 text-lg font-bold">Empty the trash?</h2>
        <p class="mb-5 text-sm text-ink-dim">
          All {{ items.length }} item(s) will be permanently deleted. This can't be undone — though a
          recent backup would still contain them.
        </p>
        <div class="flex justify-end gap-2">
          <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="confirmEmpty = false">
            Cancel
          </button>
          <button class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90" @click="empty">
            Empty trash
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
