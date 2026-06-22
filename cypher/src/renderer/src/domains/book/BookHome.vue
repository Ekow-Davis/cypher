<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Settings2, PenLine } from 'lucide-vue-next'
import { useBooksStore } from '@/stores/books'
import { assetUrl } from '@/lib/assets'

const router = useRouter()
const store = useBooksStore()

const showCreate = ref(false)
const newTitle = ref('')
const newSubtitle = ref('')
const creating = ref(false)

onMounted(() => {
  void store.load()
})

function openCreate(): void {
  newTitle.value = ''
  newSubtitle.value = ''
  showCreate.value = true
}

async function confirmCreate(): Promise<void> {
  if (!newTitle.value.trim() || creating.value) return
  creating.value = true
  try {
    const book = await store.create({
      title: newTitle.value.trim(),
      subtitle: newSubtitle.value.trim() || null
    })
    showCreate.value = false
    void router.push(`/book/${book.id}`)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <section class="px-10 py-10">
    <header class="mb-8 flex items-end justify-between">
      <div>
        <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">Public</p>
        <h1 class="text-3xl font-bold">Your Books</h1>
      </div>
      <p class="text-sm text-ink-dim">
        {{ store.books.length }} {{ store.books.length === 1 ? 'book' : 'books' }}
      </p>
    </header>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-6">
      <!-- create tile -->
      <button
        class="group flex aspect-[2/3] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border text-ink-dim transition-colors hover:border-accent-line hover:text-ink"
        @click="openCreate"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 transition-colors group-hover:bg-accent-soft"
        >
          <Plus :size="24" />
        </div>
        <span class="text-sm font-medium">Create book</span>
      </button>

      <!-- book cards -->
      <div
        v-for="book in store.books"
        :key="book.id"
        class="group relative aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
      >
        <img
          v-if="assetUrl(book.cover_path)"
          :src="assetUrl(book.cover_path) as string"
          :alt="book.title"
          class="h-full w-full object-cover"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-accent-soft p-4 text-center"
        >
          <span class="font-script text-lg font-semibold text-ink">{{ book.title }}</span>
        </div>

        <!-- title strip when not hovering (cover books) -->
        <div
          v-if="assetUrl(book.cover_path)"
          class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity group-hover:opacity-0"
        >
          <p class="truncate text-sm font-semibold text-white">{{ book.title }}</p>
        </div>

        <!-- hover actions -->
        <div
          class="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <button
            class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-sm font-semibold text-on-accent"
            @click="router.push(`/book/${book.id}`)"
          >
            <PenLine :size="16" /> Write
          </button>
          <button
            class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/15 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
            @click="router.push(`/book/${book.id}/settings`)"
          >
            <Settings2 :size="16" /> Manage
          </button>
        </div>
      </div>
    </div>

    <!-- create modal -->
    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="showCreate = false"
    >
      <div class="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-4 text-xl font-bold">Create a book</h2>

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim"
          >Title</label
        >
        <input
          v-model="newTitle"
          type="text"
          placeholder="Untitled"
          class="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-ink outline-none focus:border-accent-line"
          @keydown.enter="confirmCreate"
        />

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim"
          >Subtitle (optional)</label
        >
        <input
          v-model="newSubtitle"
          type="text"
          class="mb-6 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-ink outline-none focus:border-accent-line"
          @keydown.enter="confirmCreate"
        />

        <div class="flex justify-end gap-2">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink"
            @click="showCreate = false"
          >
            Cancel
          </button>
          <button
            class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
            :disabled="!newTitle.trim() || creating"
            @click="confirmCreate"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
