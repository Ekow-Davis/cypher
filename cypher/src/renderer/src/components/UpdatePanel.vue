<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { RefreshCw, Download, CheckCircle2, AlertCircle, Loader2 } from 'lucide-vue-next'

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; notes: string | null }
  | { status: 'downloading'; percent: number; transferred: number; total: number }
  | { status: 'ready'; version: string }
  | { status: 'none' }
  | { status: 'error'; message: string }

const state = ref<UpdateState>({ status: 'idle' })
let stop: (() => void) | null = null

const busy = computed(
  () => state.value.status === 'checking' || state.value.status === 'downloading'
)

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function check(): Promise<void> {
  state.value = (await window.cypher.updates.check()) as UpdateState
}
async function download(): Promise<void> {
  await window.cypher.updates.download()
}
async function install(): Promise<void> {
  await window.cypher.updates.install()
}

onMounted(async () => {
  state.value = (await window.cypher.updates.state()) as UpdateState
  stop = window.cypher.updates.onState((next) => {
    state.value = next as UpdateState
  })
})
onBeforeUnmount(() => stop?.())
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <RefreshCw :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Updates</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Cypher downloads only the parts that changed, so an update is a few megabytes rather than a
      fresh install.
    </p>

    <!-- available -->
    <div v-if="state.status === 'available'" class="mb-3 rounded-xl border border-accent-line bg-accent-soft p-3">
      <p class="text-sm font-semibold">Version {{ state.version }} is available</p>
      <p v-if="state.notes" class="mt-1 max-h-32 overflow-auto whitespace-pre-line text-xs text-ink-dim">
        {{ state.notes }}
      </p>
    </div>

    <!-- downloading -->
    <div v-else-if="state.status === 'downloading'" class="mb-3">
      <div class="mb-1 flex justify-between text-xs text-ink-dim">
        <span>Downloading update…</span>
        <span>{{ mb(state.transferred) }} / {{ mb(state.total) }}</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-surface-2">
        <div class="h-full bg-accent transition-all" :style="{ width: state.percent + '%' }" />
      </div>
    </div>

    <!-- ready -->
    <div v-else-if="state.status === 'ready'" class="mb-3 flex items-start gap-2 rounded-xl border border-accent-line bg-accent-soft p-3">
      <CheckCircle2 :size="16" class="mt-0.5 shrink-0 text-accent" />
      <p class="text-sm">
        Version {{ state.version }} is ready. Cypher will restart to finish installing.
      </p>
    </div>

    <p v-else-if="state.status === 'none'" class="mb-3 text-sm text-ink-dim">
      You're on the latest version.
    </p>

    <p
      v-else-if="state.status === 'error' && state.message?.includes('portable')"
      class="mb-3 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim"
    >
      <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ state.message }}
    </p>
    <p
      v-else-if="state.status === 'error'"
      class="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"
    >
      <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ state.message }}
    </p>

    <div class="flex gap-2">
      <button
        v-if="state.status === 'ready'"
        class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent"
        @click="install"
      >
        <CheckCircle2 :size="15" /> Restart &amp; install
      </button>
      <button
        v-else-if="state.status === 'available'"
        class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent"
        @click="download"
      >
        <Download :size="15" /> Download update
      </button>
      <button
        v-else-if="!(state.status === 'error' && state.message?.includes('portable'))"
        class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-60"
        :disabled="busy"
        @click="check"
      >
        <Loader2 v-if="busy" :size="15" class="animate-spin" />
        <RefreshCw v-else :size="15" />
        {{ state.status === 'checking' ? 'Checking…' : 'Check for updates' }}
      </button>
    </div>
  </div>
</template>
