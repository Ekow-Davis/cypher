<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import CollaboratorsPanel from './CollaboratorsPanel.vue'
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  WifiOff
} from 'lucide-vue-next'

const props = defineProps<{ bookId: number }>()

type Status =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced'; at: string }
  | { state: 'offline'; pending: number }
  | { state: 'error'; message: string }

interface Info {
  online: boolean
  ownerName: string | null
  isOwner: boolean
  lastSyncedAt: string | null
}

const info = ref<Info>({ online: false, ownerName: null, isOwner: false, lastSyncedAt: null })
const status = ref<Status>({ state: 'idle' })
const busy = ref(false)
const error = ref<string | null>(null)
const confirmOffline = ref(false)
let stop: (() => void) | null = null

const lastSynced = computed(() => {
  const at = status.value.state === 'synced' ? status.value.at : info.value.lastSyncedAt
  return at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
})

async function load(): Promise<void> {
  info.value = await window.cypher.onlineBooks.info(props.bookId)
  status.value = (await window.cypher.onlineBooks.status(props.bookId)) as Status
}

async function goOnline(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    const result = await window.cypher.onlineBooks.makeOnline(props.bookId)
    if (!result.ok) error.value = result.reason ?? 'Could not put this book online.'
    await load()
  } finally {
    busy.value = false
  }
}

async function goOffline(): Promise<void> {
  if (!confirmOffline.value) {
    confirmOffline.value = true
    setTimeout(() => (confirmOffline.value = false), 5000)
    return
  }
  confirmOffline.value = false
  busy.value = true
  error.value = null
  try {
    const result = await window.cypher.onlineBooks.takeOffline(props.bookId)
    if (!result.ok) error.value = result.reason ?? 'Could not take this book offline.'
    await load()
  } finally {
    busy.value = false
  }
}

async function syncNow(): Promise<void> {
  busy.value = true
  try {
    status.value = (await window.cypher.onlineBooks.syncNow(props.bookId)) as Status
    await load()
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await load()
  stop = window.cypher.onlineBooks.onStatus((payload) => {
    if (payload.bookId === props.bookId) status.value = payload.status as Status
  })
})
onBeforeUnmount(() => stop?.())
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <component :is="info.online ? Cloud : CloudOff" :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">{{ info.online ? 'Online book' : 'Write with someone' }}</h2>
    </div>

    <!-- offline -->
    <template v-if="!info.online">
      <p class="mb-4 text-sm text-ink-dim">
        Putting a book online copies it to your Cypher server so you can write it with someone
        else. Everything else stays exactly where it is.
      </p>
      <button
        class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
        :disabled="busy"
        @click="goOnline"
      >
        <Loader2 v-if="busy" :size="15" class="animate-spin" />
        <Cloud v-else :size="15" />
        Put this book online
      </button>
    </template>

    <!-- online -->
    <template v-else>
      <p class="mb-3 text-sm text-ink-dim">
        <template v-if="info.isOwner">This book is yours and syncs to your server.</template>
        <template v-else>Shared with you by {{ info.ownerName ?? 'another writer' }}.</template>
      </p>

      <div class="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 p-3">
        <Loader2 v-if="status.state === 'syncing'" :size="15" class="shrink-0 animate-spin text-accent" />
        <WifiOff v-else-if="status.state === 'offline'" :size="15" class="shrink-0 text-amber-400" />
        <AlertCircle v-else-if="status.state === 'error'" :size="15" class="shrink-0 text-red-400" />
        <Check v-else :size="15" class="shrink-0 text-accent" />

        <span class="min-w-0 flex-1 text-xs">
          <template v-if="status.state === 'syncing'">Syncing…</template>
          <template v-else-if="status.state === 'offline'">
            Working offline — {{ status.pending }} change{{ status.pending === 1 ? '' : 's' }}
            waiting. They'll go up when you're back online.
          </template>
          <template v-else-if="status.state === 'error'">{{ status.message }}</template>
          <template v-else-if="lastSynced">Everything saved · last synced {{ lastSynced }}</template>
          <template v-else>Not synced yet</template>
        </span>

        <button
          class="shrink-0 rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink disabled:opacity-50"
          :disabled="busy"
          title="Sync now"
          @click="syncNow"
        >
          <RefreshCw :size="14" />
        </button>
      </div>

      <button
        class="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-60"
        :class="confirmOffline ? 'border-amber-400 text-amber-400' : 'border-border text-ink-dim hover:text-ink'"
        :disabled="busy"
        @click="goOffline"
      >
        <CloudOff :size="15" />
        {{ confirmOffline ? 'Click again to confirm' : 'Take offline' }}
      </button>
      <p v-if="confirmOffline" class="mt-2 text-xs text-amber-400">
        <template v-if="info.isOwner">
          The book is synced first, then removed from the server. Anyone you're writing with loses
          access and keeps only what they already had.
        </template>
        <template v-else>
          You'll keep a copy of everything written so far, but stop receiving updates.
        </template>
      </p>

      <p
        v-if="error"
        class="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"
      >
        <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
      </p>
    </template>
  </div>

  <CollaboratorsPanel
    v-if="info.online"
    :book-id="props.bookId"
    :is-owner="info.isOwner"
    class="mt-6"
  />
</template>
