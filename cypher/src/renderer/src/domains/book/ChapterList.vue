<script setup lang="ts">
import { ref, reactive, watch, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  FolderPlus
} from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import type { Chapter, Volume, ChapterPlacement } from '@shared/types'

const store = useChaptersStore()

interface Group {
  volume: Volume
  items: Chapter[]
}
const groups = ref<Group[]>([])
const unsorted = ref<Chapter[]>([])
const collapsed = reactive<Record<number, boolean>>({})

function byOrder(a: Chapter, b: Chapter): number {
  return a.sort_order - b.sort_order || a.id - b.id
}

function buildGroups(): void {
  groups.value = store.volumes.map((v) => ({
    volume: v,
    items: store.chapters.filter((c) => c.volume_id === v.id).slice().sort(byOrder)
  }))
  unsorted.value = store.chapters.filter((c) => c.volume_id == null).slice().sort(byOrder)
}

// Rebuild only on STRUCTURAL changes (add/remove chapter, add/remove/reorder volume).
// A drag changes neither the chapter count nor the volume id-order, so it never
// clobbers the lists the user just rearranged.
watch(
  () => [store.chapters.length, store.volumes.map((v) => v.id).join(',')] as const,
  buildGroups,
  { immediate: true }
)

// After any drag, serialise the full placement and persist it.
function persist(): void {
  const placements: ChapterPlacement[] = []
  for (const g of groups.value) {
    g.items.forEach((c, i) => placements.push({ id: c.id, volumeId: g.volume.id, sortOrder: i }))
  }
  unsorted.value.forEach((c, i) => placements.push({ id: c.id, volumeId: null, sortOrder: i }))
  void store.applyOrder(placements)
}

// ----- volume rename -----
const editingVolumeId = ref<number | null>(null)
const editingTitle = ref('')
const volNameInput = ref<HTMLInputElement | null>(null)

function startRenameVolume(v: Volume): void {
  editingVolumeId.value = v.id
  editingTitle.value = v.title
  void nextTick(() => volNameInput.value?.focus())
}
async function commitVolumeRename(): Promise<void> {
  if (editingVolumeId.value != null) {
    await store.renameVolume(editingVolumeId.value, editingTitle.value)
  }
  editingVolumeId.value = null
}

function toggleCollapse(id: number): void {
  collapsed[id] = !collapsed[id]
}
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Manuscript</span>
      <div class="flex items-center gap-1">
        <button
          class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          title="Add volume"
          @click="store.addVolume()"
        >
          <FolderPlus :size="16" />
        </button>
        <button
          class="rounded-lg p-1 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          title="Add chapter"
          @click="store.add(null)"
        >
          <Plus :size="16" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto py-2">
      <!-- volumes -->
      <div v-for="(g, gi) in groups" :key="g.volume.id" class="mb-1">
        <div
          class="group/vol mx-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-ink-dim hover:bg-surface-2"
        >
          <button class="shrink-0 rounded p-0.5 hover:text-ink" @click="toggleCollapse(g.volume.id)">
            <component :is="collapsed[g.volume.id] ? ChevronRight : ChevronDown" :size="14" />
          </button>

          <input
            v-if="editingVolumeId === g.volume.id"
            ref="volNameInput"
            v-model="editingTitle"
            class="min-w-0 flex-1 rounded border border-accent-line bg-surface px-1 py-0.5 text-sm text-ink outline-none"
            @keydown.enter="commitVolumeRename"
            @blur="commitVolumeRename"
          />
          <span
            v-else
            class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide"
            @dblclick="startRenameVolume(g.volume)"
            >{{ g.volume.title }}</span
          >

          <span class="shrink-0 text-[10px]">{{ g.items.length }}</span>

          <div class="flex shrink-0 items-center opacity-0 transition-opacity group-hover/vol:opacity-100">
            <button
              class="rounded p-0.5 hover:text-ink disabled:opacity-30"
              :disabled="gi === 0"
              title="Move up"
              @click="store.moveVolume(g.volume.id, -1)"
            >
              <ChevronUp :size="13" />
            </button>
            <button
              class="rounded p-0.5 hover:text-ink disabled:opacity-30"
              :disabled="gi === groups.length - 1"
              title="Move down"
              @click="store.moveVolume(g.volume.id, 1)"
            >
              <ChevronDown :size="13" />
            </button>
            <button
              class="rounded p-0.5 hover:text-ink"
              title="Add chapter to volume"
              @click="store.add(g.volume.id)"
            >
              <Plus :size="13" />
            </button>
            <button
              class="rounded p-0.5 hover:text-red-400"
              title="Delete volume"
              @click="store.deleteVolume(g.volume.id)"
            >
              <Trash2 :size="13" />
            </button>
          </div>
        </div>

        <VueDraggable
          v-show="!collapsed[g.volume.id]"
          v-model="g.items"
          :group="{ name: 'chapters' }"
          :animation="150"
          handle=".drag-handle"
          class="min-h-[6px] pl-3"
          @end="persist"
        >
          <div
            v-for="(ch, i) in g.items"
            :key="ch.id"
            class="group/row mx-2 mb-1 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 transition-colors"
            :class="
              store.activeId === ch.id
                ? 'bg-accent-soft text-ink'
                : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
            "
            @click="store.setActive(ch.id)"
          >
            <GripVertical
              :size="13"
              class="drag-handle shrink-0 cursor-grab opacity-0 group-hover/row:opacity-50"
            />
            <span class="w-4 shrink-0 text-[11px] text-ink-dim">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <span class="block truncate text-sm">{{ ch.title }}</span>
              <span class="block text-[10px] text-ink-dim">{{ ch.word_count.toLocaleString() }} words</span>
            </div>
            <button
              class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
              title="Delete chapter"
              @click.stop="store.remove(ch.id)"
            >
              <Trash2 :size="13" />
            </button>
          </div>
        </VueDraggable>
      </div>

      <!-- unsorted -->
      <div class="mt-1">
        <div
          v-if="groups.length"
          class="mx-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim"
        >
          Unsorted
        </div>
        <VueDraggable
          v-model="unsorted"
          :group="{ name: 'chapters' }"
          :animation="150"
          handle=".drag-handle"
          class="min-h-[12px]"
          @end="persist"
        >
          <div
            v-for="(ch, i) in unsorted"
            :key="ch.id"
            class="group/row mx-2 mb-1 flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 transition-colors"
            :class="
              store.activeId === ch.id
                ? 'bg-accent-soft text-ink'
                : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
            "
            @click="store.setActive(ch.id)"
          >
            <GripVertical
              :size="13"
              class="drag-handle shrink-0 cursor-grab opacity-0 group-hover/row:opacity-50"
            />
            <span class="w-4 shrink-0 text-[11px] text-ink-dim">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <span class="block truncate text-sm">{{ ch.title }}</span>
              <span class="block text-[10px] text-ink-dim">{{ ch.word_count.toLocaleString() }} words</span>
            </div>
            <button
              class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
              title="Delete chapter"
              @click.stop="store.remove(ch.id)"
            >
              <Trash2 :size="13" />
            </button>
          </div>
        </VueDraggable>
      </div>
    </div>
  </aside>
</template>
