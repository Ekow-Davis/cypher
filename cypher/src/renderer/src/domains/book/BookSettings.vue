<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Image as ImageIcon,
  Trash2,
  Archive,
  BookText,
  Feather,
  AlertTriangle
} from 'lucide-vue-next'
import { useBooksStore } from '@/stores/books'
import { assetUrl } from '@/lib/assets'
import type { Book, BookStatus } from '@shared/types'

const route = useRoute()
const router = useRouter()
const store = useBooksStore()

const id = Number(route.params.id)
const loaded = ref(false)
const saving = ref(false)
const confirmDelete = ref(false)
const coverPath = ref<string | null>(null)

const form = reactive({
  title: '',
  subtitle: '',
  synopsis: '',
  status: 'draft' as BookStatus,
  author: '',
  genre: '',
  language: 'en'
})

type Pane = 'details' | 'publishing' | 'danger'
const pane = ref<Pane>('details')
const PANES: { key: Pane; label: string; icon: typeof BookText }[] = [
  { key: 'details', label: 'Details', icon: BookText },
  { key: 'publishing', label: 'Publishing', icon: Feather },
  { key: 'danger', label: 'Danger zone', icon: AlertTriangle }
]

// Common codes kept short; the field accepts anything typed.
const LANGUAGES = ['en', 'fr', 'es', 'de', 'pt', 'zh', 'ja', 'ko', 'ar', 'sw', 'tw']

const statuses: BookStatus[] = ['draft', 'ongoing', 'complete']

function hydrate(b: Book): void {
  form.title = b.title
  form.subtitle = b.subtitle ?? ''
  form.synopsis = b.synopsis ?? ''
  form.status = b.status
  form.author = b.author ?? ''
  form.genre = b.genre ?? ''
  form.language = b.language || 'en'
  coverPath.value = b.cover_path
}

onMounted(async () => {
  const book = await store.get(id)
  if (book) hydrate(book)
  loaded.value = true
})

async function save(): Promise<void> {
  saving.value = true
  try {
    await store.update(id, {
      title: form.title.trim() || 'Untitled',
      subtitle: form.subtitle.trim() || null,
      synopsis: form.synopsis.trim() || null,
      status: form.status,
      author: form.author.trim() || null,
      genre: form.genre.trim() || null,
      language: form.language.trim() || 'en'
    })
  } finally {
    saving.value = false
  }
}

async function changeCover(): Promise<void> {
  await store.importCover(id)
  const book = await store.get(id)
  if (book) coverPath.value = book.cover_path
}

async function removeBook(): Promise<void> {
  await store.remove(id)
  void router.push('/book')
}

async function archiveBook(): Promise<void> {
  await store.archive(id, true)
  void router.push('/book')
}
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 py-8 sm:px-10 sm:py-10">
    <button
      class="mb-6 flex items-center gap-1 text-sm text-ink-dim transition-colors hover:text-ink"
      @click="router.push('/book')"
    >
      <ArrowLeft :size="18" /> Back to shelf
    </button>

    <nav class="mb-6 flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
      <button
        v-for="p in PANES"
        :key="p.key"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors"
        :class="pane === p.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-dim hover:text-ink'"
        @click="pane = p.key"
      >
        <component :is="p.icon" :size="15" />
        {{ p.label }}
      </button>
    </nav>

    <h1 class="mb-8 text-3xl font-bold">Book settings</h1>

    <div
      v-if="loaded"
      :class="
        pane === 'details' ? 'grid grid-cols-1 gap-6 md:grid-cols-[1fr_220px]' : 'space-y-6'
      "
    >
      <!-- form -->
      <div v-show="pane === 'details'" class="rounded-2xl border border-border bg-surface p-6">
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim"
          >Title</label
        >
        <input
          v-model="form.title"
          class="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent-line"
        />

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim"
          >Subtitle</label
        >
        <input
          v-model="form.subtitle"
          class="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent-line"
        />

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim"
          >Synopsis</label
        >
        <textarea
          v-model="form.synopsis"
          rows="4"
          class="mb-4 w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent-line"
        ></textarea>

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim"
          >Status</label
        >
        <div class="flex gap-2">
          <button
            v-for="s in statuses"
            :key="s"
            class="rounded-xl border px-3 py-1.5 text-sm font-medium capitalize transition-colors"
            :class="
              form.status === s
                ? 'border-accent-line bg-accent-soft text-ink'
                : 'border-border bg-surface-2 text-ink-dim hover:text-ink'
            "
            @click="form.status = s"
          >
            {{ s }}
          </button>
        </div>

        <div class="mt-6">
          <button
            class="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </div>

      <!-- cover -->
      <div v-show="pane === 'details'" class="space-y-6">
        <div class="rounded-2xl border border-border bg-surface p-4">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">Cover</p>
          <div class="mb-3 aspect-[2/3] overflow-hidden rounded-xl border border-border bg-surface-2">
            <img
              v-if="assetUrl(coverPath)"
              :src="assetUrl(coverPath) as string"
              class="h-full w-full object-cover"
            />
            <div v-else class="flex h-full w-full items-center justify-center text-ink-dim">
              <ImageIcon :size="28" />
            </div>
          </div>
          <button
            class="w-full rounded-xl border border-border bg-surface-2 py-2 text-sm font-medium transition-colors hover:text-ink"
            @click="changeCover"
          >
            Change cover
          </button>
        </div>

      </div>

      <!-- PUBLISHING -->
      <div v-show="pane === 'publishing'" class="rounded-2xl border border-border bg-surface p-6">
        <h2 class="mb-1 text-lg font-semibold">Publishing</h2>
        <p class="mb-5 text-sm text-ink-dim">
          Used on exports. The author here overrides your default name, so a book can carry its own
          pen name.
        </p>

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
          Author
        </label>
        <input
          v-model="form.author"
          placeholder="Falls back to your default name"
          class="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        />

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
          Genre
        </label>
        <input
          v-model="form.genre"
          placeholder="e.g. Epic fantasy"
          class="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        />

        <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
          Language
        </label>
        <input
          v-model="form.language"
          list="book-languages"
          placeholder="en"
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        />
        <datalist id="book-languages">
          <option v-for="l in LANGUAGES" :key="l" :value="l" />
        </datalist>
        <p class="mt-1 text-xs text-ink-dim">Written into EPUB metadata.</p>
      </div>

      <!-- DANGER ZONE -->
      <div v-show="pane === 'danger'" class="rounded-2xl border border-border bg-surface p-6">
        <h2 class="mb-1 text-lg font-semibold">Danger zone</h2>
        <p class="mb-5 text-sm text-ink-dim">
          Archiving hides the book from the shelf. Deleting moves it to the trash, where it can be
          restored.
        </p>
        <div class="max-w-xs space-y-2">
          <button
            class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2 text-sm font-medium transition-colors hover:text-ink"
            @click="archiveBook"
          >
            <Archive :size="16" /> Archive this book
          </button>
          <button
            v-if="!confirmDelete"
            class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            @click="confirmDelete = true"
          >
            <Trash2 :size="16" /> Delete this book
          </button>
          <button
            v-else
            class="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white"
            @click="removeBook"
          >
            Confirm delete
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
