<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import SidebarRail from '@/components/SidebarRail.vue'
import { ShieldAlert, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'
import { usePreferencesStore } from '@/stores/preferences'

const route = useRoute()
const appStore = useAppStore()
const theme = useThemeStore()
const prefs = usePreferencesStore()

watch(
  () => route.meta.themeDomain,
  (domain) => {
    theme.activeDomain = domain ?? null
  },
  { immediate: true }
)

const archiveReminder = ref(false)

async function runArchive(): Promise<void> {
  archiveReminder.value = false
  try {
    await window.cypher.backup.archive()
  } catch {
    /* the settings panel surfaces detail */
  }
}
function snooze(): void {
  archiveReminder.value = false
  void window.cypher.backup.snoozeArchive(3)
}

onMounted(async () => {
  void theme.load()
  void prefs.load()
  void appStore.init()
  try {
    archiveReminder.value = await window.cypher.backup.archiveDue()
  } catch {
    /* older main process — ignore */
  }
})
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-bg text-ink">
    <SidebarRail v-if="!appStore.focusMode" />
    <div class="flex min-w-0 flex-1 flex-col">
      <div
        v-if="archiveReminder && !appStore.focusMode"
        class="flex items-center gap-2 border-b border-border bg-accent-soft px-4 py-2 text-sm"
      >
        <ShieldAlert :size="16" class="shrink-0 text-accent" />
        <span class="flex-1">Time to save a full archive of your work somewhere safe.</span>
        <button class="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-on-accent" @click="runArchive">
          Export now
        </button>
        <button class="rounded-lg px-2 py-1 text-xs text-ink-dim hover:text-ink" @click="snooze">
          Later
        </button>
        <button class="rounded p-1 text-ink-dim hover:text-ink" title="Dismiss" @click="archiveReminder = false">
          <X :size="14" />
        </button>
      </div>
      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
