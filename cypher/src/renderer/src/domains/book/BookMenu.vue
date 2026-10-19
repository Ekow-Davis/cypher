<script setup lang="ts">
/**
 * The "⋯" menu on a shelf book: move to a folder, archive or bring back,
 * and the book's settings page.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  MoreHorizontal,
  Folder,
  FolderMinus,
  FolderPlus,
  Archive,
  ArchiveRestore,
  Settings2,
  Check
} from 'lucide-vue-next'
import type { Book } from '@shared/types'
import { useBooksStore } from '@/stores/books'

const props = defineProps<{ book: Book; light?: boolean }>()
const emit = defineEmits<{ newFolder: [bookId: number] }>()

const store = useBooksStore()
const router = useRouter()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent): void {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent): void {
  if (open.value && e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
})

async function move(folderId: number | null): Promise<void> {
  open.value = false
  await store.moveToFolder(props.book.id, folderId)
}
async function toggleArchive(): Promise<void> {
  open.value = false
  await store.archive(props.book.id, !props.book.archived)
}
function newFolder(): void {
  open.value = false
  emit('newFolder', props.book.id)
}
</script>

<template>
  <div ref="root" class="relative" @click.stop>
    <button
      class="rounded-md p-1.5 transition-colors"
      :class="
        light
          ? 'bg-black/40 text-white backdrop-blur hover:bg-black/60'
          : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
      "
      title="More"
      @click="open = !open"
    >
      <MoreHorizontal :size="16" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-border bg-surface p-1 text-sm text-ink shadow-xl"
    >
      <p class="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
        Move to folder
      </p>
      <button
        v-for="f in store.folders"
        :key="f.id"
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
        @click="move(f.id)"
      >
        <Folder :size="14" class="shrink-0 text-ink-dim" />
        <span class="flex-1 truncate">{{ f.name }}</span>
        <Check v-if="book.folder_id === f.id" :size="14" class="text-accent" />
      </button>
      <button
        v-if="book.folder_id != null"
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
        @click="move(null)"
      >
        <FolderMinus :size="14" class="shrink-0 text-ink-dim" /> Take out of folder
      </button>
      <button
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
        @click="newFolder"
      >
        <FolderPlus :size="14" class="shrink-0 text-ink-dim" /> New folder…
      </button>

      <div class="my-1 h-px bg-border" />
      <button
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
        @click="toggleArchive"
      >
        <template v-if="book.archived">
          <ArchiveRestore :size="14" class="shrink-0 text-ink-dim" /> Move back to the shelf
        </template>
        <template v-else>
          <Archive :size="14" class="shrink-0 text-ink-dim" /> Archive
        </template>
      </button>
      <button
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
        @click="router.push(`/book/${book.id}/settings`)"
      >
        <Settings2 :size="14" class="shrink-0 text-ink-dim" /> Manage book
      </button>
    </div>
  </div>
</template>
