<script setup lang="ts">
import { ref, watch } from 'vue'
import { UserRound, UserPlus } from 'lucide-vue-next'
import { useCharactersStore } from '@/stores/characters'
import { assetUrl } from '@/lib/assets'

export interface MentionItem {
  id: number | string
  label: string
  image?: string | null
  isCreate?: boolean
}

const props = defineProps<{
  items: MentionItem[]
  command: (attrs: { id: number; label: string }) => void
}>()

const store = useCharactersStore()
const selected = ref(0)

watch(
  () => props.items,
  () => {
    selected.value = 0
  }
)

async function selectItem(index: number): Promise<void> {
  const item = props.items[index]
  if (!item) return
  if (item.isCreate) {
    const created = await store.createNamed(item.label)
    if (created) props.command({ id: created.id, label: created.name })
    return
  }
  props.command({ id: Number(item.id), label: item.label })
}

function onKeyDown({ event }: { event: KeyboardEvent }): boolean {
  if (event.key === 'ArrowDown') {
    selected.value = (selected.value + 1) % Math.max(1, props.items.length)
    return true
  }
  if (event.key === 'ArrowUp') {
    selected.value = (selected.value + props.items.length - 1) % Math.max(1, props.items.length)
    return true
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    void selectItem(selected.value)
    return true
  }
  return false
}

defineExpose({ onKeyDown })
</script>

<template>
  <div
    class="max-h-72 w-64 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-xl"
  >
    <button
      v-for="(item, i) in items"
      :key="`${item.id}-${i}`"
      class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
      :class="i === selected ? 'bg-accent-soft text-ink' : 'text-ink-dim hover:bg-surface-2'"
      @mouseenter="selected = i"
      @click="selectItem(i)"
    >
      <template v-if="item.isCreate">
        <UserPlus :size="15" class="shrink-0 text-accent" />
        <span class="min-w-0 flex-1 truncate">
          Create <span class="font-semibold text-ink">{{ item.label }}</span>
        </span>
      </template>
      <template v-else>
        <span class="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2">
          <img v-if="item.image" :src="assetUrl(item.image)" class="h-full w-full object-cover" alt="" />
          <span v-else class="flex h-full w-full items-center justify-center text-ink-dim">
            <UserRound :size="12" />
          </span>
        </span>
        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
      </template>
    </button>

    <div v-if="!items.length" class="px-2 py-2 text-xs text-ink-dim">No characters yet.</div>
  </div>
</template>
