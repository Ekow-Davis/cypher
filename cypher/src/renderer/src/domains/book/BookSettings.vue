<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Image as ImageIcon, Trash2, Archive } from 'lucide-vue-next'
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
  status: 'draft' as BookStatus
})

const statuses: BookStatus[] = ['draft', 'ongoing', 'complete']

function hydrate(b: Book): void {
  form.title = b.title
  form.subtitle = b.subtitle ?? ''
  form.synopsis = b.synopsis ?? ''
  form.status = b.status
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
      status: form.status
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
  <section class="mx-auto max-w-3xl px-10 py-10">
    <button
      class="mb-6 flex items-center gap-1 text-sm text-ink-dim transition-colors hover:text-ink"
      @click="router.push('/book')"
    >
      <ArrowLeft :size="18" /> Back to shelf
    </button>

    <h1 class="mb-8 text-3xl font-bold">Book settings</h1>

    <div v-if="loaded" class="grid grid-cols-1 gap-6 md:grid-cols-[1fr_220px]">
      <!-- form -->
      <div class="rounded-2xl border border-border bg-surface p-6">
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

      <!-- cover + manage -->
      <div class="space-y-6">
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

        <div class="rounded-2xl border border-border bg-surface p-4">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">Manage</p>
          <button
            class="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2 text-sm font-medium transition-colors hover:text-ink"
            @click="archiveBook"
          >
            <Archive :size="16" /> Archive
          </button>
          <button
            v-if="!confirmDelete"
            class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            @click="confirmDelete = true"
          >
            <Trash2 :size="16" /> Delete
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
