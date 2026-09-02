<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Users,
  Globe,
  LogIn,
  LogOut,
  Check,
  AlertCircle,
  Loader2,
  Copy,
  ExternalLink
} from 'lucide-vue-next'

interface Profile {
  id: string
  email: string
  displayName: string
  joinCode: string
}

const enabled = ref(false)
const profile = ref<Profile | null>(null)
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const copied = ref<string | null>(null)
const serverUrl = ref('')

async function load(): Promise<void> {
  enabled.value = await window.cypher.account.onlineEnabled()
  profile.value = (await window.cypher.account.profile()) as Profile | null
  const all = await window.cypher.settings.getAll()
  serverUrl.value = String(all.shareServerUrl ?? '')
  if (enabled.value && profile.value) {
    // The join code may have been rotated on the website since last time.
    const fresh = (await window.cypher.account.refresh()) as Profile | null
    if (fresh) profile.value = fresh
  }
}

async function toggleOnline(): Promise<void> {
  enabled.value = !enabled.value
  await window.cypher.account.setOnlineEnabled(enabled.value)
  if (!enabled.value) profile.value = null
}

async function signIn(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    const result = await window.cypher.account.signIn(email.value, password.value)
    if (!result.ok) error.value = result.reason ?? 'Could not sign in.'
    else {
      profile.value = result.profile as Profile
      email.value = ''
      password.value = ''
    }
  } finally {
    busy.value = false
  }
}

async function signOut(): Promise<void> {
  await window.cypher.account.signOut()
  profile.value = null
}

async function copy(label: string, value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
  copied.value = label
  setTimeout(() => (copied.value = null), 1500)
}

onMounted(load)
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Users :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Account &amp; collaboration</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Only needed to write a book together with someone else.
    </p>

    <label class="mb-4 flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        class="mt-0.5 h-4 w-4 shrink-0"
        style="accent-color: var(--color-accent)"
        :checked="enabled"
        @change="toggleOnline"
      />
      <span>
        <span class="block text-sm">Enable online features</span>
        <span class="block text-xs text-ink-dim">
          Leave this off and Cypher never connects for your writing — everything stays on this
          machine.
        </span>
      </span>
    </label>

    <template v-if="enabled">
      <p
        v-if="!serverUrl"
        class="mb-4 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim"
      >
        <Globe :size="14" class="mt-0.5 shrink-0" />
        Set your Cypher server URL below before signing in.
      </p>

      <!-- signed in -->
      <div v-if="profile" class="space-y-3">
        <div class="rounded-xl border border-border bg-surface-2/60 p-3">
          <p class="text-sm font-medium">{{ profile.displayName }}</p>
          <p class="text-xs text-ink-dim">{{ profile.email }}</p>
        </div>

        <div>
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Your writer ID
          </div>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-xs">
              {{ profile.id }}
            </code>
            <button
              class="shrink-0 rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink"
              title="Copy"
              @click="copy('id', profile.id)"
            >
              <component :is="copied === 'id' ? Check : Copy" :size="14" />
            </button>
          </div>
        </div>

        <div>
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Your join code
          </div>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-1.5 text-xs">
              {{ profile.joinCode }}
            </code>
            <button
              class="shrink-0 rounded-lg border border-border p-1.5 text-ink-dim hover:text-ink"
              title="Copy"
              @click="copy('code', profile.joinCode)"
            >
              <component :is="copied === 'code' ? Check : Copy" :size="14" />
            </button>
          </div>
          <p class="mt-1 text-xs text-ink-dim">
            Someone needs both of these to add you to a book. Change the code on the website to
            cancel invitations you haven't accepted.
          </p>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink"
            @click="signOut"
          >
            <LogOut :size="15" /> Sign out
          </button>
          <a
            v-if="serverUrl"
            :href="`${serverUrl.replace(/\/+$/, '')}/account`"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink"
          >
            <ExternalLink :size="15" /> Manage on the website
          </a>
        </div>
      </div>

      <!-- signed out -->
      <div v-else class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Email
          </label>
          <input
            v-model="email"
            type="email"
            class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Password
          </label>
          <input
            v-model="password"
            type="password"
            class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
            @keydown.enter="signIn"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
            :disabled="busy || !email || !password || !serverUrl"
            @click="signIn"
          >
            <Loader2 v-if="busy" :size="15" class="animate-spin" />
            <LogIn v-else :size="15" />
            Sign in
          </button>
          <a
            v-if="serverUrl"
            :href="`${serverUrl.replace(/\/+$/, '')}/account/signup`"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink"
          >
            <ExternalLink :size="15" /> Create an account
          </a>
        </div>
      </div>

      <p
        v-if="error"
        class="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"
      >
        <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
      </p>
    </template>
  </div>
</template>
