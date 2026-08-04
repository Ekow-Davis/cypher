<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { KeyRound, ShieldCheck, AlertCircle, Check } from 'lucide-vue-next'
import { useDiaryStore } from '@/stores/diary'

const store = useDiaryStore()

const current = ref('')
const newEntry = ref('')
const newTranslate = ref('')
const busy = ref(false)
const message = ref<string | null>(null)
const ok = ref(false)

async function submit(): Promise<void> {
  message.value = null
  ok.value = false
  if (!newEntry.value && !newTranslate.value) {
    message.value = 'Enter at least one new password.'
    return
  }
  if (newEntry.value && newTranslate.value && newEntry.value === newTranslate.value) {
    message.value = 'The two passwords must be different.'
    return
  }
  busy.value = true
  try {
    const result = await window.cypher.diary.changePasswords(
      current.value,
      newEntry.value || null,
      newTranslate.value || null
    )
    if (result.ok) {
      ok.value = true
      message.value = 'Password updated.'
      current.value = newEntry.value = newTranslate.value = ''
    } else {
      message.value = result.reason ?? 'Could not update the password.'
    }
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

onMounted(() => void store.refreshStatus())
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <ShieldCheck :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Diary passwords</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Changing a password re-secures the diary without touching a single entry — everything you've
      written stays readable.
    </p>

    <p v-if="!store.status.configured" class="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim">
      The diary hasn't been set up yet. Open the Diary tab to choose your passwords.
    </p>

    <div v-else class="space-y-3">
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
          Current entry password
        </label>
        <input
          v-model="current"
          type="password"
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
          New entry password <span class="font-normal normal-case text-ink-dim">(optional)</span>
        </label>
        <input
          v-model="newEntry"
          type="password"
          placeholder="Leave blank to keep it"
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
          New translation password <span class="font-normal normal-case text-ink-dim">(optional)</span>
        </label>
        <input
          v-model="newTranslate"
          type="password"
          placeholder="Leave blank to keep it"
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          @keydown.enter="submit"
        />
      </div>

      <button
        class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
        :disabled="busy || !current"
        @click="submit"
      >
        <KeyRound :size="15" /> {{ busy ? 'Updating…' : 'Update password' }}
      </button>

      <p
        v-if="message"
        class="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
        :class="ok ? 'bg-accent-soft' : 'bg-red-500/10 text-red-300'"
      >
        <component :is="ok ? Check : AlertCircle" :size="14" class="mt-0.5 shrink-0" />{{ message }}
      </p>
    </div>
  </div>
</template>
