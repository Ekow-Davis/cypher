<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NotebookPen, FileText, BookOpen, BookMarked, Settings, Sun, Moon } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useBreakpoint } from '@/lib/useBreakpoint'
import logo from '@/assets/logo.png'
import { useThemeStore } from '@/stores/theme'

const appStore = useAppStore()
const { isTight } = useBreakpoint()
const theme = useThemeStore()

const items = [
  { to: '/diary', label: 'Diary', icon: NotebookPen },
  { to: '/document', label: 'Document', icon: FileText },
  { to: '/book', label: 'Book', icon: BookOpen },
  { to: '/reader', label: 'Reader', icon: BookMarked }
]

// Show the icon for the action: a sun (switch to light) while dark, a moon while light.
const isDark = computed(() => theme.effectiveMode() === 'dark')
const toggleLabel = computed(() => (isDark.value ? 'Light' : 'Dark'))
</script>

<template>
  <aside
    :class="['flex shrink-0 flex-col items-center gap-2 border-r border-border bg-surface py-4', isTight ? 'w-14' : 'w-20']"
  >
    <img
      :src="logo"
      alt="Cypher"
      class="mb-4 select-none rounded-xl"
      :class="isTight ? 'h-8 w-8' : 'h-10 w-10'"
      draggable="false"
    />

    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :class="['group flex flex-col items-center gap-1 rounded-xl py-3 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink', isTight ? 'w-11' : 'w-16']"
      active-class="bg-surface-2 text-accent"
    >
      <component :is="item.icon" :size="22" />
      <span v-if="!isTight" class="text-[10px] font-medium">{{ item.label }}</span>
    </RouterLink>

    <!-- bottom cluster -->
    <div class="mt-auto flex flex-col items-center gap-1">
      <button
        :class="['flex flex-col items-center gap-1 rounded-xl py-3 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink', isTight ? 'w-11' : 'w-16']"
        :title="`Switch to ${toggleLabel.toLowerCase()} mode`"
        @click="theme.toggleMode()"
      >
        <component :is="isDark ? Sun : Moon" :size="22" />
        <span v-if="!isTight" class="text-[10px] font-medium">{{ toggleLabel }}</span>
      </button>

      <RouterLink
        to="/settings"
        :class="['flex flex-col items-center gap-1 rounded-xl py-3 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink', isTight ? 'w-11' : 'w-16']"
        active-class="bg-surface-2 text-accent"
      >
        <Settings :size="22" />
        <span v-if="!isTight" class="text-[10px] font-medium">Settings</span>
      </RouterLink>

      <div v-if="!isTight" class="select-none pt-1 text-[9px] text-ink-dim">v{{ appStore.version || '0.1.0' }}</div>
    </div>
  </aside>
</template>
