<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Check, Database } from 'lucide-vue-next'
import {
  useThemeStore,
  PRESET_ACCENTS,
  ACCENT_COLORS,
  type Scope,
  type Mode,
  type DomainKey
} from '@/stores/theme'

const theme = useThemeStore()

const scopes: { key: Scope; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'diary', label: 'Diary' },
  { key: 'document', label: 'Document' },
  { key: 'book', label: 'Book' }
]
const scope = ref<Scope>('global')
const isDomain = computed(() => scope.value !== 'global')
const choice = computed(() => theme.choiceFor(scope.value))

function selectScope(s: Scope): void {
  scope.value = s
  theme.previewScope = s === 'global' ? null : (s as DomainKey)
}

onMounted(() => {
  theme.previewScope = null
})
onBeforeUnmount(() => {
  theme.previewScope = null
})

const modeOptions = computed<{ value: Mode | null; label: string }[]>(() =>
  isDomain.value
    ? [
        { value: null, label: 'Inherit' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' }
      ]
    : [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' }
      ]
)

interface DbInfo {
  path: string
  version: number
  tables: number
  tableNames: string[]
}
const dbInfo = ref<DbInfo | null>(null)
const dbError = ref<string | null>(null)

onMounted(async () => {
  try {
    dbInfo.value = await window.cypher.db.info()
  } catch (error) {
    dbError.value = String(error)
  }
})
</script>

<template>
  <section class="mx-auto max-w-3xl px-10 py-12">
    <h1 class="mb-1 text-3xl font-bold">Settings</h1>
    <p class="mb-8 text-ink-dim">Appearance and preferences.</p>

    <div class="rounded-2xl border border-border bg-surface p-6">
      <h2 class="mb-1 text-lg font-semibold">Appearance</h2>
      <p class="mb-6 text-sm leading-relaxed text-ink-dim">
        Mode sets the body (light or dark); accent sets the highlight colour.
        Pick a scope to theme everything at once, or give a single area its own look.
      </p>

      <!-- Scope -->
      <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">Scope</p>
      <div class="mb-7 inline-flex rounded-xl border border-border bg-surface-2 p-1">
        <button
          v-for="s in scopes"
          :key="s.key"
          class="rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors"
          :class="scope === s.key ? 'bg-accent text-on-accent' : 'text-ink-dim hover:text-ink'"
          @click="selectScope(s.key)"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- Mode -->
      <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">Mode</p>
      <div class="mb-7 flex gap-2">
        <button
          v-for="m in modeOptions"
          :key="String(m.value)"
          class="rounded-xl border px-4 py-2 text-sm font-medium transition-colors"
          :class="
            choice.mode === m.value
              ? 'border-accent-line bg-accent-soft text-ink'
              : 'border-border bg-surface-2 text-ink-dim hover:text-ink'
          "
          @click="theme.setMode(scope, m.value)"
        >
          {{ m.label }}
        </button>
      </div>

      <!-- Accent -->
      <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">Accent</p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          v-if="isDomain"
          class="rounded-xl border px-4 py-2 text-sm font-medium transition-colors"
          :class="
            choice.accent === null
              ? 'border-accent-line bg-accent-soft text-ink'
              : 'border-border bg-surface-2 text-ink-dim hover:text-ink'
          "
          @click="theme.setAccent(scope, null)"
        >
          Inherit
        </button>

        <button
          v-for="a in PRESET_ACCENTS"
          :key="a"
          class="relative h-10 w-10 rounded-full ring-2 ring-offset-2 ring-offset-surface transition"
          :class="choice.accent === a ? 'ring-ink' : 'ring-transparent hover:ring-border'"
          :style="{ backgroundColor: ACCENT_COLORS[a] }"
          :title="a"
          @click="theme.setAccent(scope, a)"
        >
          <Check v-if="choice.accent === a" class="absolute inset-0 m-auto h-5 w-5 text-white" />
        </button>

        <!-- Custom colour -->
        <label
          class="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition"
          :class="choice.accent === 'custom' ? 'ring-ink' : 'ring-transparent hover:ring-border'"
          style="
            background: conic-gradient(
              from 180deg,
              #ef4444,
              #eab308,
              #22c55e,
              #06b6d4,
              #6366f1,
              #ec4899,
              #ef4444
            );
          "
          title="Custom colour"
        >
          <input
            type="color"
            class="absolute inset-0 cursor-pointer opacity-0"
            :value="choice.customHex || '#8b7bd6'"
            @input="theme.setCustom(scope, ($event.target as HTMLInputElement).value)"
          />
          <Check
            v-if="choice.accent === 'custom'"
            class="pointer-events-none relative h-5 w-5 text-white drop-shadow"
          />
        </label>
      </div>

      <p v-if="isDomain" class="mt-6 text-xs leading-relaxed text-ink-dim">
        Editing <span class="font-semibold capitalize text-ink">{{ scope }}</span>.
        &ldquo;Inherit&rdquo; follows the Global theme. Changes preview live here and apply
        whenever you open {{ scope }}.
      </p>
    </div>

    <div class="mt-6 rounded-2xl border border-border bg-surface p-6">
      <div class="mb-1 flex items-center gap-2">
        <Database :size="18" class="text-accent" />
        <h2 class="text-lg font-semibold">Storage</h2>
      </div>
      <p class="mb-4 text-sm text-ink-dim">Local database status.</p>

      <div v-if="dbInfo" class="space-y-2 text-sm">
        <div class="flex justify-between gap-4">
          <span class="text-ink-dim">Schema version</span>
          <span class="font-medium">{{ dbInfo.version }}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-ink-dim">Tables</span>
          <span class="font-medium">{{ dbInfo.tables }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-ink-dim">Location</span>
          <span class="truncate font-mono text-xs text-ink-dim" :title="dbInfo.path">{{ dbInfo.path }}</span>
        </div>
      </div>
      <p v-else-if="dbError" class="text-sm text-red-400">Database error: {{ dbError }}</p>
      <p v-else class="text-sm text-ink-dim">Checking…</p>
    </div>
  </section>
</template>
