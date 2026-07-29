<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import {
  UserPlus,
  FolderPlus,
  Trash2,
  ChevronDown,
  ChevronRight,
  UserRound,
  AlertCircle,
  X
} from 'lucide-vue-next'
import { useCharactersStore } from '@/stores/characters'
import { assetUrl } from '@/lib/assets'
import CharacterSheet from './CharacterSheet.vue'

const store = useCharactersStore()
const collapsed = reactive<Record<string, boolean>>({})

function toggle(folder: string): void {
  collapsed[folder] = !collapsed[folder]
}

// ----- new folder -----
const newFolderMode = ref(false)
const newFolderName = ref('')
const newFolderInput = ref<HTMLInputElement | null>(null)

function startNewFolder(): void {
  newFolderMode.value = true
  newFolderName.value = ''
  void nextTick(() => newFolderInput.value?.focus())
}
async function confirmNewFolder(): Promise<void> {
  const name = newFolderName.value.trim()
  newFolderMode.value = false
  if (name) await store.add(name) // seeds a starter character in the new folder
}
</script>

<template>
  <div class="flex h-full flex-1 flex-col overflow-hidden">
    <!-- error bar -->
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

    <div class="flex flex-1 overflow-hidden">
      <!-- cast list -->
      <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Cast</span>
          <div class="flex items-center gap-1">
            <button
              class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="New folder"
              @click="startNewFolder"
            >
              <FolderPlus :size="16" />
            </button>
            <button
              class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              title="New character"
              @click="store.add(null)"
            >
              <UserPlus :size="16" />
            </button>
          </div>
        </div>

        <div v-if="newFolderMode" class="border-b border-border px-3 py-2">
          <input
            ref="newFolderInput"
            v-model="newFolderName"
            placeholder="Folder name…"
            class="w-full rounded-lg border border-accent-line bg-surface-2 px-2 py-1 text-sm outline-none"
            @keydown.enter="confirmNewFolder"
            @keydown.esc="newFolderMode = false"
            @blur="confirmNewFolder"
          />
          <p class="mt-1 text-[10px] text-ink-dim">Enter to create · Esc to cancel</p>
        </div>

        <div class="flex-1 overflow-auto py-2">
          <div v-if="!store.characters.length" class="px-4 py-6 text-center text-xs text-ink-dim">
            No characters yet. Create your first.
          </div>

          <div v-for="g in store.groups" :key="g.folder" class="mb-1">
            <div class="group/fld mx-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-ink-dim hover:bg-surface-2">
              <button class="shrink-0 rounded p-0.5 hover:text-ink" @click="toggle(g.folder)">
                <component :is="collapsed[g.folder] ? ChevronRight : ChevronDown" :size="14" />
              </button>
              <span class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide">
                {{ g.folder }}
              </span>
              <span class="shrink-0 text-[10px]">{{ g.items.length }}</span>
              <button
                class="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:text-ink group-hover/fld:opacity-100"
                title="Add character to folder"
                @click="store.add(g.folder === 'Unfiled' ? null : g.folder)"
              >
                <UserPlus :size="13" />
              </button>
            </div>

            <div v-show="!collapsed[g.folder]" class="pl-3">
              <div
                v-for="c in g.items"
                :key="c.id"
                class="group/row mx-2 mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
                :class="
                  store.activeId === c.id
                    ? 'bg-accent-soft text-ink'
                    : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
                "
                @click="store.setActive(c.id)"
              >
                <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2">
                  <img
                    v-if="c.image_path"
                    :src="assetUrl(c.image_path)"
                    class="h-full w-full object-cover"
                    alt=""
                  />
                  <div v-else class="flex h-full w-full items-center justify-center text-ink-dim">
                    <UserRound :size="14" />
                  </div>
                </div>
                <span class="min-w-0 flex-1 truncate text-sm">{{ c.name }}</span>
                <button
                  class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
                  title="Delete character"
                  @click.stop="store.remove(c.id)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- sheet -->
      <main class="flex-1 overflow-hidden">
        <CharacterSheet v-if="store.active" :character="store.active" />
        <div v-else class="flex h-full items-center justify-center text-ink-dim">
          Select or create a character.
        </div>
      </main>
    </div>
  </div>
</template>
