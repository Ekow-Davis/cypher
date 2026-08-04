<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Lock, KeyRound, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-vue-next'
import { useDiaryStore } from '@/stores/diary'

const store = useDiaryStore()

const entryPass = ref('')
const translatePass = ref('')
const confirmPass = ref('')
const message = ref<string | null>(null)
const busy = ref(false)
const reveal = ref(false)
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const isSetup = computed(() => !store.status.configured)

/** Live countdown while locked out, so the wait is visible rather than a dead form. */
const lockRemaining = computed(() => {
  if (!store.status.lockedUntil) return 0
  return Math.max(0, new Date(store.status.lockedUntil).getTime() - now.value)
})
const lockLabel = computed(() => {
  const secs = Math.ceil(lockRemaining.value / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
})
const isLocked = computed(() => lockRemaining.value > 0)

const canSetup = computed(
  () =>
    entryPass.value.length >= 4 &&
    translatePass.value.length >= 4 &&
    entryPass.value === confirmPass.value &&
    entryPass.value !== translatePass.value
)

async function doSetup(): Promise<void> {
  message.value = null
  if (entryPass.value === translatePass.value) {
    message.value = 'The two passwords must be different.'
    return
  }
  busy.value = true
  const ok = await store.setup(entryPass.value, translatePass.value)
  busy.value = false
  if (!ok) message.value = store.lastError ?? 'Could not set up the diary.'
  entryPass.value = translatePass.value = confirmPass.value = ''
}

async function doUnlock(): Promise<void> {
  message.value = null
  busy.value = true
  const result = await store.unlock(entryPass.value)
  busy.value = false
  if (!result.ok) message.value = result.message ?? 'Could not unlock.'
  entryPass.value = ''
}

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 500)
})
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<template>
  <div class="flex h-full items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <div class="mb-6 text-center">
        <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
          <component :is="isSetup ? ShieldCheck : Lock" :size="26" class="text-accent" />
        </div>
        <h1 class="text-xl font-bold">{{ isSetup ? 'Set up your diary' : 'Diary locked' }}</h1>
        <p class="mt-1 text-sm text-ink-dim">
          {{
            isSetup
              ? 'Two passwords: one opens the diary, the other reveals it in plain text.'
              : 'Enter your password to open the diary.'
          }}
        </p>
      </div>

      <!-- SETUP -->
      <div v-if="isSetup" class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Entry password
          </label>
          <input
            v-model="entryPass"
            :type="reveal ? 'text' : 'password'"
            placeholder="Opens the diary"
            class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Confirm entry password
          </label>
          <input
            v-model="confirmPass"
            :type="reveal ? 'text' : 'password'"
            class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Translation password
          </label>
          <input
            v-model="translatePass"
            :type="reveal ? 'text' : 'password'"
            placeholder="Reveals entries in plain text"
            class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
            @keydown.enter="canSetup && doSetup()"
          />
        </div>

        <label class="flex items-center gap-2 text-xs text-ink-dim">
          <input v-model="reveal" type="checkbox" class="h-3.5 w-3.5" style="accent-color: var(--color-accent)" />
          Show passwords
        </label>

        <p class="rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
          There is no recovery. Nothing is sent anywhere and no reset link exists — if both
          passwords are lost, the entries cannot be read again by anyone, including you.
        </p>

        <button
          class="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-on-accent disabled:opacity-50"
          :disabled="!canSetup || busy"
          @click="doSetup"
        >
          {{ busy ? 'Setting up…' : 'Create diary' }}
        </button>
        <p v-if="entryPass && translatePass && entryPass === translatePass" class="text-xs text-amber-400">
          The two passwords must be different.
        </p>
      </div>

      <!-- UNLOCK -->
      <div v-else class="space-y-3">
        <div v-if="isLocked" class="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-center">
          <AlertCircle :size="18" class="mx-auto mb-1 text-red-400" />
          <p class="text-sm text-red-300">Too many attempts</p>
          <p class="text-xs text-ink-dim">Try again in {{ lockLabel }}</p>
        </div>

        <div v-else>
          <div class="relative">
            <input
              v-model="entryPass"
              :type="reveal ? 'text' : 'password'"
              placeholder="Entry password"
              class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 pr-10 text-sm outline-none focus:border-accent-line"
              @keydown.enter="doUnlock"
            />
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-dim hover:text-ink"
              :title="reveal ? 'Hide' : 'Show'"
              @click="reveal = !reveal"
            >
              <component :is="reveal ? EyeOff : Eye" :size="15" />
            </button>
          </div>

          <button
            class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-on-accent disabled:opacity-50"
            :disabled="!entryPass || busy"
            @click="doUnlock"
          >
            <KeyRound :size="15" />
            {{ busy ? 'Opening…' : 'Unlock' }}
          </button>

          <p v-if="store.status.failCount > 0" class="mt-2 text-center text-[11px] text-ink-dim">
            {{ store.status.failCount }} failed attempt{{ store.status.failCount === 1 ? '' : 's' }}
          </p>
        </div>
      </div>

      <p v-if="message" class="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
        <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ message }}
      </p>
    </div>
  </div>
</template>
