<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Globe, Check, AlertCircle, Loader2 } from 'lucide-vue-next'

const baseUrl = ref('')
const publishKey = ref('')
const busy = ref(false)
const message = ref<string | null>(null)
const ok = ref(false)

async function load(): Promise<void> {
  try {
    const all = await window.cypher.settings.getAll()
    baseUrl.value = String(all.shareServerUrl ?? '')
    publishKey.value = String(all.sharePublishKey ?? '')
  } catch {
    /* first run */
  }
}

async function save(): Promise<void> {
  busy.value = true
  message.value = null
  try {
    await window.cypher.settings.set('shareServerUrl', baseUrl.value.trim())
    await window.cypher.settings.set('sharePublishKey', publishKey.value.trim())
    ok.value = true
    message.value = 'Saved.'
  } catch (e) {
    ok.value = false
    message.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

/** Confirms the URL is reachable before you rely on it mid-publish. */
async function test(): Promise<void> {
  busy.value = true
  message.value = null
  try {
    const url = baseUrl.value.trim().replace(/\/+$/, '')
    const response = await fetch(`${url}/health`)
    ok.value = response.ok
    message.value = response.ok ? 'Server reachable.' : `Server returned ${response.status}.`
  } catch (e) {
    ok.value = false
    message.value = `Could not reach the server: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Globe :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Share server</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Where published links are hosted. Leave blank to keep sharing as saved web pages instead.
    </p>

    <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
      Server URL
    </label>
    <input
      v-model="baseUrl"
      placeholder="https://cypher-share.up.railway.app"
      class="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
    />

    <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
      Publish key
    </label>
    <input
      v-model="publishKey"
      type="password"
      placeholder="The PUBLISH_KEY set on the server"
      class="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
    />

    <div class="flex gap-2">
      <button
        class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
        :disabled="busy"
        @click="save"
      >
        <Loader2 v-if="busy" :size="15" class="animate-spin" /> Save
      </button>
      <button
        class="rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-60"
        :disabled="busy || !baseUrl"
        @click="test"
      >
        Test connection
      </button>
    </div>

    <p
      v-if="message"
      class="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
      :class="ok ? 'bg-accent-soft' : 'bg-red-500/10 text-red-300'"
    >
      <component :is="ok ? Check : AlertCircle" :size="14" class="mt-0.5 shrink-0" />{{ message }}
    </p>

    <p class="mt-3 text-xs text-ink-dim">
      The key only authorises publishing. Readers need nothing — the link itself is the access.
    </p>
  </div>
</template>
