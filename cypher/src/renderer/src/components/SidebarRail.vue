<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NotebookPen, FileText, BookOpen, Settings, Sun, Moon } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'

const appStore = useAppStore()
const theme = useThemeStore()

const items = [
  { to: '/diary', label: 'Diary', icon: NotebookPen },
  { to: '/document', label: 'Document', icon: FileText },
  { to: '/book', label: 'Book', icon: BookOpen }
]

// Show the icon for the action: a sun (switch to light) while dark, a moon while light.
const isDark = computed(() => theme.effectiveMode() === 'dark')
const toggleLabel = computed(() => (isDark.value ? 'Light' : 'Dark'))
</script>

<template>
  <aside
    class="flex w-20 shrink-0 flex-col items-center gap-2 border-r border-border bg-surface py-4"
  >
    <div class="mb-4 select-none text-lg font-bold tracking-widest text-accent">CY</div>

    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="group flex w-16 flex-col items-center gap-1 rounded-xl py-3 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
      active-class="bg-surface-2 text-accent"
    >
      <component :is="item.icon" :size="22" />
      <span class="text-[10px] font-medium">{{ item.label }}</span>
    </RouterLink>

    <!-- bottom cluster -->
    <div class="mt-auto flex flex-col items-center gap-1">
      <button
        class="flex w-16 flex-col items-center gap-1 rounded-xl py-3 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        :title="`Switch to ${toggleLabel.toLowerCase()} mode`"
        @click="theme.toggleMode()"
      >
        <component :is="isDark ? Sun : Moon" :size="22" />
        <span class="text-[10px] font-medium">{{ toggleLabel }}</span>
      </button>

      <RouterLink
        to="/settings"
        class="flex w-16 flex-col items-center gap-1 rounded-xl py-3 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        active-class="bg-surface-2 text-accent"
      >
        <Settings :size="22" />
        <span class="text-[10px] font-medium">Settings</span>
      </RouterLink>

      <div class="select-none pt-1 text-[9px] text-ink-dim">v{{ appStore.version || '0.1.0' }}</div>
    </div>
  </aside>
</template>
