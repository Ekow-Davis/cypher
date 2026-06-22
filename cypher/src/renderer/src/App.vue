<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import SidebarRail from '@/components/SidebarRail.vue'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()
const appStore = useAppStore()
const theme = useThemeStore()

watch(
  () => route.meta.themeDomain,
  (domain) => {
    theme.activeDomain = domain ?? null
  },
  { immediate: true }
)

onMounted(() => {
  void theme.load()
  void appStore.init()
})
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-bg text-ink">
    <SidebarRail />
    <main class="flex-1 overflow-auto">
      <RouterView />
    </main>
  </div>
</template>
