<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Users, UserPlus, Crown, Check, AlertCircle, Loader2, Info } from 'lucide-vue-next'

const props = defineProps<{ bookId: number; isOwner: boolean }>()

interface Collaborator {
  id: string
  displayName: string
  isOwner: boolean
}

const people = ref<Collaborator[]>([])
const writerId = ref('')
const joinCode = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const confirmRemove = ref<string | null>(null)

async function load(): Promise<void> {
  people.value = await window.cypher.collab.list(props.bookId)
}

async function add(): Promise<void> {
  busy.value = true
  error.value = null
  notice.value = null
  try {
    const result = await window.cypher.collab.add(
      props.bookId,
      writerId.value,
      joinCode.value
    )
    if (!result.ok) {
      error.value = result.reason ?? 'Could not add that writer.'
      return
    }
    notice.value = `${result.displayName ?? 'They'} can now open this book.`
    writerId.value = ''
    joinCode.value = ''
    await load()
  } finally {
    busy.value = false
  }
}

async function remove(person: Collaborator): Promise<void> {
  if (confirmRemove.value !== person.id) {
    confirmRemove.value = person.id
    setTimeout(() => (confirmRemove.value = null), 4000)
    return
  }
  confirmRemove.value = null
  busy.value = true
  error.value = null
  try {
    const result = await window.cypher.collab.remove(props.bookId, person.id)
    if (!result.ok) error.value = result.reason ?? 'Could not remove that writer.'
    await load()
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <Users :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Who can write this book</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Everyone here edits the same manuscript. Changes merge as you both write.
    </p>

    <div v-if="people.length" class="mb-4 space-y-1">
      <div
        v-for="person in people"
        :key="person.id"
        class="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2"
      >
        <Crown v-if="person.isOwner" :size="14" class="shrink-0 text-accent" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ person.displayName }}</span>
        <span v-if="person.isOwner" class="shrink-0 text-[10px] text-ink-dim">Owner</span>
        <button
          v-else-if="isOwner"
          class="shrink-0 rounded-lg px-2 py-1 text-xs transition-colors"
          :class="confirmRemove === person.id ? 'text-amber-400' : 'text-ink-dim hover:text-red-400'"
          :disabled="busy"
          @click="remove(person)"
        >
          {{ confirmRemove === person.id ? 'Confirm' : 'Remove' }}
        </button>
      </div>
    </div>

    <template v-if="isOwner">
      <div class="mb-3 rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-ink-dim">
        <p class="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <Info :size="13" /> You'll need two things from them
        </p>
        <p>
          Their <strong>writer ID</strong> and their <strong>join code</strong>, both on their
          account page. The code is what confirms they actually want to write with you — knowing
          someone's ID alone isn't enough.
        </p>
      </div>

      <div class="space-y-2">
        <input
          v-model="writerId"
          placeholder="Writer ID"
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-xs outline-none focus:border-accent-line"
        />
        <input
          v-model="joinCode"
          placeholder="Join code"
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-accent-line"
          @keydown.enter="add"
        />
        <button
          class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
          :disabled="busy || !writerId.trim() || !joinCode.trim()"
          @click="add"
        >
          <Loader2 v-if="busy" :size="15" class="animate-spin" />
          <UserPlus v-else :size="15" />
          Add writer
        </button>
      </div>
    </template>
    <p v-else class="text-xs text-ink-dim">
      Only the book's owner can add or remove writers.
    </p>

    <p v-if="notice" class="mt-3 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs">
      <Check :size="14" class="mt-0.5 shrink-0 text-accent" />{{ notice }}
    </p>
    <p
      v-if="error"
      class="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"
    >
      <AlertCircle :size="14" class="mt-0.5 shrink-0" />{{ error }}
    </p>
  </div>
</template>
