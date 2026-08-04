<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  NotebookPen,
  Plus,
  FolderPlus,
  Lock,
  Trash2,
  Wind,
  AlertCircle,
  X,
  Eye,
  ChevronRight,
  ChevronDown
} from 'lucide-vue-next'
import { useDiaryStore } from '@/stores/diary'
import { useBreakpoint } from '@/lib/useBreakpoint'
import DiaryLock from './DiaryLock.vue'
import DiaryEntryEditor from './DiaryEntryEditor.vue'

const store = useDiaryStore()
const { isTight } = useBreakpoint()

const newDiaryMode = ref(false)
const newDiaryName = ref('')
const newDiaryInput = ref<HTMLInputElement | null>(null)
const collapsed = ref<Record<string, boolean>>({})

const translatePrompt = ref(false)
const translatePass = ref('')
const translateError = ref<string | null>(null)
const translateInput = ref<HTMLInputElement | null>(null)

let poll: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await store.refreshStatus()
  if (store.unlocked) await store.loadAll()
  // The translation window expires in main; poll so the UI re-locks with it
  // rather than showing plain text that is no longer authorised.
  poll = setInterval(() => {
    if (store.unlocked && store.translated) void store.refreshStatus()
  }, 15_000)
})
onBeforeUnmount(() => {
  if (poll) clearInterval(poll)
})

function startNewDiary(): void {
  newDiaryMode.value = true
  newDiaryName.value = ''
  void nextTick(() => newDiaryInput.value?.focus())
}
async function confirmNewDiary(): Promise<void> {
  const name = newDiaryName.value.trim()
  newDiaryMode.value = false
  if (name) await store.addDiary(name)
}

function openTranslate(): void {
  translatePrompt.value = true
  translatePass.value = ''
  translateError.value = null
  void nextTick(() => translateInput.value?.focus())
}
async function confirmTranslate(): Promise<void> {
  const ok = await store.unlockTranslation(translatePass.value)
  if (ok) {
    translatePrompt.value = false
    translatePass.value = ''
  } else {
    translateError.value = 'That translation password is not right.'
  }
}

function monthLabel(month: string): string {
  if (month === 'undated') return 'Undated'
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
}

function toggleMonth(month: string): void {
  collapsed.value = { ...collapsed.value, [month]: !collapsed.value[month] }
}

const scopeLabel = computed(() =>
  store.activeDiaryId === null ? 'Loose entries' : (store.activeDiary?.name ?? 'Diary')
)
</script>

<template>
  <!-- Locked or not yet configured: nothing else in this domain renders. -->
  <DiaryLock v-if="!store.unlocked" />

  <div v-else class="flex h-full flex-col overflow-hidden">
    <header class="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:px-5">
      <NotebookPen :size="18" class="shrink-0 text-accent" />
      <h1 class="min-w-0 truncate text-lg font-semibold">{{ scopeLabel }}</h1>

      <button
        class="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
        title="Lock the diary now"
        @click="store.lock()"
      >
        <Lock :size="15" />
        <span v-if="!isTight">Lock</span>
      </button>
    </header>

    <div
      v-if="store.lastError"
      class="flex items-start gap-2 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300"
    >
      <AlertCircle :size="16" class="mt-0.5 shrink-0" />
      <span class="flex-1">{{ store.lastError }}</span>
      <button class="shrink-0 hover:text-red-100" @click="store.clearError()"><X :size="15" /></button>
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- diaries + entries -->
      <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Diaries</span>
          <div class="flex items-center gap-1">
            <button
              class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="New diary"
              @click="startNewDiary"
            >
              <FolderPlus :size="16" />
            </button>
            <button
              class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="New entry"
              @click="store.addEntry()"
            >
              <Plus :size="16" />
            </button>
          </div>
        </div>

        <div v-if="newDiaryMode" class="border-b border-border px-3 py-2">
          <input
            ref="newDiaryInput"
            v-model="newDiaryName"
            placeholder="Diary name…"
            class="w-full rounded-lg border border-accent-line bg-surface-2 px-2 py-1 text-sm outline-none"
            @keydown.enter="confirmNewDiary"
            @keydown.esc="newDiaryMode = false"
            @blur="confirmNewDiary"
          />
          <p class="mt-1 text-[10px] text-ink-dim">Enter to create · Esc to cancel</p>
        </div>

        <div class="border-b border-border py-1">
          <button
            class="group flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm transition-colors"
            :class="store.activeDiaryId === null ? 'bg-accent-soft text-ink' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
            @click="store.selectDiary(null)"
          >
            <Wind :size="14" class="shrink-0 opacity-70" />
            <span class="min-w-0 flex-1 truncate">Loose entries</span>
          </button>
          <div
            v-for="d in store.diaries"
            :key="d.id"
            class="group flex items-center gap-1 px-2"
          >
            <button
              class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
              :class="store.activeDiaryId === d.id ? 'bg-accent-soft text-ink' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
              @click="store.selectDiary(d.id)"
            >
              <NotebookPen :size="14" class="shrink-0 opacity-70" />
              <span class="min-w-0 flex-1 truncate">{{ d.name }}</span>
            </button>
            <button
              class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              title="Delete diary (entries are kept)"
              @click="store.removeDiary(d.id)"
            >
              <Trash2 :size="13" />
            </button>
          </div>
        </div>

        <!-- entries, grouped by month -->
        <div class="flex-1 overflow-auto py-2">
          <p v-if="!store.entries.length" class="px-4 py-6 text-center text-xs text-ink-dim">
            No entries here yet.
          </p>

          <div v-for="group in store.entriesByMonth" :key="group.month" class="mb-1">
            <button
              class="flex w-full items-center gap-1 px-3 py-1.5 text-left text-ink-dim hover:text-ink"
              @click="toggleMonth(group.month)"
            >
              <component :is="collapsed[group.month] ? ChevronRight : ChevronDown" :size="13" />
              <span class="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide">
                {{ monthLabel(group.month) }}
              </span>
              <span class="shrink-0 text-[10px]">{{ group.items.length }}</span>
            </button>

            <div v-show="!collapsed[group.month]">
              <button
                v-for="entry in group.items"
                :key="entry.id"
                class="mx-2 mb-1 block w-[calc(100%-1rem)] rounded-lg px-3 py-2 text-left transition-colors"
                :class="store.activeEntryId === entry.id ? 'bg-accent-soft text-ink' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'"
                @click="store.setActiveEntry(entry.id)"
              >
                <span class="block truncate text-sm" :class="store.translated ? '' : 'font-script'">
                  {{ entry.title || 'Untitled entry' }}
                </span>
                <span class="block text-[10px] text-ink-dim">
                  {{ new Date(entry.created_at.replace(' ', 'T') + 'Z').toLocaleDateString() }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main class="min-w-0 flex-1 overflow-hidden">
        <DiaryEntryEditor
          v-if="store.activeEntry"
          :entry="store.activeEntry"
          @request-translate="openTranslate"
        />
        <div v-else class="flex h-full flex-col items-center justify-center gap-2 text-ink-dim">
          <NotebookPen :size="34" class="opacity-40" />
          <p class="text-sm">Nothing open.</p>
          <button
            class="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent"
            @click="store.addEntry()"
          >
            Write an entry
          </button>
        </div>
      </main>
    </div>

    <!-- translation password -->
    <div
      v-if="translatePrompt"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="translatePrompt = false"
    >
      <div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div class="mb-3 flex items-center gap-2">
          <Eye :size="18" class="text-accent" />
          <h2 class="text-base font-semibold">Reveal in plain text</h2>
        </div>
        <p class="mb-4 text-sm text-ink-dim">
          Your translation password shows entries as readable text for 20 minutes, then hides them
          again on its own.
        </p>
        <input
          ref="translateInput"
          v-model="translatePass"
          type="password"
          placeholder="Translation password"
          class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-line"
          @keydown.enter="confirmTranslate"
          @keydown.esc="translatePrompt = false"
        />
        <p v-if="translateError" class="mt-2 text-xs text-red-400">{{ translateError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink"
            @click="translatePrompt = false"
          >
            Cancel
          </button>
          <button
            class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
            :disabled="!translatePass"
            @click="confirmTranslate"
          >
            Reveal
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
