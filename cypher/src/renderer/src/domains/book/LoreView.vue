<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import {
  Plus,
  FolderPlus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ScrollText,
  AlertCircle,
  X,
  Search
} from 'lucide-vue-next'
import { useLoreStore } from '@/stores/lore'
import { useBreakpoint } from '@/lib/useBreakpoint'
import LoreEditor from './LoreEditor.vue'
import LoreSidebar from './LoreSidebar.vue'
import LoreSearch from './LoreSearch.vue'

defineProps<{ showSidebar?: boolean }>()

const store = useLoreStore()
const { isTight } = useBreakpoint()
const collapsed = reactive<Record<string, boolean>>({})
const searching = ref(false)

function toggle(category: string): void {
  collapsed[category] = !collapsed[category]
}

// ----- new category -----
const newCategoryMode = ref(false)
const newCategoryName = ref('')
const newCategoryInput = ref<HTMLInputElement | null>(null)

function startNewCategory(): void {
  newCategoryMode.value = true
  newCategoryName.value = ''
  void nextTick(() => newCategoryInput.value?.focus())
}
async function confirmNewCategory(): Promise<void> {
  const name = newCategoryName.value.trim()
  newCategoryMode.value = false
  if (name) await store.add(name) // creates a starter entry in the new category
}
</script>

<template>
  <div class="flex h-full flex-1 flex-col overflow-hidden">
    <!-- prominent, actionable error bar -->
    <div
      v-if="store.lastError"
      class="flex items-start gap-2 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300"
    >
      <AlertCircle :size="16" class="mt-0.5 shrink-0" />
      <span class="flex-1">{{ store.lastError }}</span>
      <button class="shrink-0 hover:text-red-100" title="Dismiss" @click="store.clearError()">
        <X :size="15" />
      </button>
    </div>

    <div class="relative flex flex-1 overflow-hidden">
      <!-- entry list -->
      <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Codex</span>
          <div class="flex items-center gap-1">
            <button
              class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="Search codex"
              @click="searching = true"
            >
              <Search :size="16" />
            </button>
            <button
              class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="New category"
              @click="startNewCategory"
            >
              <FolderPlus :size="16" />
            </button>
            <button
              class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="New entry"
              @click="store.add('General')"
            >
              <Plus :size="16" />
            </button>
          </div>
        </div>

        <!-- new-category inline input -->
        <div v-if="newCategoryMode" class="border-b border-border px-3 py-2">
          <input
            ref="newCategoryInput"
            v-model="newCategoryName"
            placeholder="Category name…"
            class="w-full rounded-lg border border-accent-line bg-surface-2 px-2 py-1 text-sm outline-none"
            @keydown.enter="confirmNewCategory"
            @keydown.esc="newCategoryMode = false"
            @blur="confirmNewCategory"
          />
          <p class="mt-1 text-[10px] text-ink-dim">Enter to create · Esc to cancel</p>
        </div>

        <LoreSearch v-if="searching" @close="searching = false" />

        <div v-else class="flex-1 overflow-auto py-2">
          <div v-if="!store.entries.length" class="px-4 py-6 text-center text-xs text-ink-dim">
            No lore yet. Create your first entry.
          </div>

          <div v-for="g in store.groups" :key="g.category" class="mb-1">
            <div class="group/cat mx-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-ink-dim hover:bg-surface-2">
              <button class="shrink-0 rounded p-0.5 hover:text-ink" @click="toggle(g.category)">
                <component :is="collapsed[g.category] ? ChevronRight : ChevronDown" :size="14" />
              </button>
              <span class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide">
                {{ g.category }}
              </span>
              <span class="shrink-0 text-[10px]">{{ g.items.length }}</span>
              <button
                class="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:text-ink group-hover/cat:opacity-100"
                title="Add entry to category"
                @click="store.add(g.category)"
              >
                <Plus :size="13" />
              </button>
            </div>

            <div v-show="!collapsed[g.category]" class="pl-3">
              <div
                v-for="e in g.items"
                :key="e.id"
                class="group/row mx-2 mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors"
                :class="
                  store.activeId === e.id
                    ? 'bg-accent-soft text-ink'
                    : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
                "
                @click="store.setActive(e.id)"
              >
                <ScrollText :size="13" class="shrink-0 opacity-60" />
                <span class="min-w-0 flex-1 truncate text-sm">{{ e.title }}</span>
                <button
                  class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
                  title="Delete entry"
                  @click.stop="store.remove(e.id)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- editor -->
      <main class="min-w-0 flex-1 overflow-hidden">
        <LoreEditor v-if="store.active" :entry="store.active" />
        <div v-else class="flex h-full items-center justify-center text-ink-dim">
          Select or create a lore entry.
        </div>
      </main>

      <!-- right sidebar -->
      <LoreSidebar
        v-if="showSidebar"
        :class="isTight ? 'absolute inset-y-0 right-0 z-30 shadow-2xl' : ''"
      />
    </div>
  </div>
</template>
