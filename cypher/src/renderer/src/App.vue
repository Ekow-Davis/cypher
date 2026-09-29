<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SidebarRail from '@/components/SidebarRail.vue'
import { ShieldAlert, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'
import { usePreferencesStore } from '@/stores/preferences'
import { installSync } from '@/lib/sync'
import { applyScriptFont } from '@/lib/scriptFont'
import { useFontsStore } from '@/stores/fonts'
import ThesaurusPopup from '@/components/ThesaurusPopup.vue'
import WhatsNewDialog from '@/components/WhatsNewDialog.vue'
import WrapHint from '@/components/WrapHint.vue'
import { installWrap } from '@/lib/wrapSelection'
import { installMouseButtons } from '@/lib/mouseButtons'
import { installStatsTracker } from '@/lib/statsTracker'
import { installTextRulesForFields } from '@/lib/textRules'
import CommandPalette from '@/components/CommandPalette.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const theme = useThemeStore()
const prefs = usePreferencesStore()
const fonts = useFontsStore()

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

// One variable drives both writing surfaces, so a font chosen once applies to
// the manuscript and the lore editor without either knowing about the setting.
watch(
  () => prefs.editorFont,
  (family) => {
    document.documentElement.style.setProperty(
      '--font-editor',
      family || 'Georgia, "Times New Roman", serif'
    )
  },
  { immediate: true }
)

watch(
  () => prefs.editorFontSize,
  (px) => document.documentElement.style.setProperty('--editor-size', `${px}px`),
  { immediate: true }
)

watch(
  () => prefs.uiFont,
  (family) => {
    if (family) document.documentElement.style.setProperty('--font-ui', family)
    else document.documentElement.style.removeProperty('--font-ui')
  },
  { immediate: true }
)

// Interface scale goes through the window's zoom rather than a root font-size:
// much of the chrome is sized in pixels, and zoom scales all of it evenly,
// including the maths behind popups and page layout.
watch(
  () => prefs.uiScale,
  (scale) => {
    try {
      window.cypher.view.setZoom(scale)
    } catch {
      /* older preload */
    }
  },
  { immediate: true }
)

onMounted(async () => {
  installWrap()
  installMouseButtons(router)
  installStatsTracker(router)
  installTextRulesForFields()
  try {
    // Ctrl + / Ctrl - / Ctrl 0, as in a browser; caught in main so the
    // default zoom never runs alongside.
    window.cypher.view.onZoomStep((step) => {
      if (step === 0) prefs.setUiScale(1)
      else prefs.stepUiScale(step)
    })
  } catch {
    /* older preload */
  }
  installSync()
  void applyScriptFont()
  void fonts.load()
  void theme.load()
  void prefs.load()
  void appStore.init().then(async () => {
    // Once, in the main window only — a second window opening shouldn't
    // bring the release notes back.
    try {
      if (!(await window.cypher.windows.isSecondary())) await appStore.checkWhatsNew()
    } catch {
      /* older preload */
    }
  })
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
  <ThesaurusPopup />
  <WhatsNewDialog />
  <WrapHint />
  <CommandPalette />
</template>
