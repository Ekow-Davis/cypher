<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ShieldCheck, FolderOpen, Loader2, RotateCcw, Trash2, Download } from 'lucide-vue-next'
import type { BackupInfo, ArchiveCadence } from '@shared/types'

const backups = ref<BackupInfo[]>([])
const busy = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

const enabled = ref(true)
const intervalHours = ref(24)
const keep = ref(10)
const cadence = ref<ArchiveCadence>('monthly')
const lastBackupAt = ref<string | null>(null)
const lastArchiveAt = ref<string | null>(null)

const confirmRestore = ref<BackupInfo | null>(null)

const INTERVALS = [
  { v: 1, label: 'Hourly' },
  { v: 6, label: 'Every 6h' },
  { v: 24, label: 'Daily' },
  { v: 168, label: 'Weekly' }
]

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function fmtDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

async function refresh(): Promise<void> {
  try {
    backups.value = await window.cypher.backup.list()
    const all = (await window.cypher.settings.getAll()) as Record<string, unknown>
    enabled.value = all.backupEnabled !== false
    intervalHours.value = Number(all.backupIntervalHours ?? 24)
    keep.value = Number(all.backupKeep ?? 10)
    cadence.value = (all.archiveReminder as ArchiveCadence) ?? 'monthly'
    lastBackupAt.value = (all.lastBackupAt as string) ?? null
    lastArchiveAt.value = (all.lastArchiveAt as string) ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function set(key: string, value: unknown): Promise<void> {
  try {
    await window.cypher.settings.set(key, value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function backupNow(): Promise<void> {
  busy.value = true
  message.value = null
  error.value = null
  try {
    const info = await window.cypher.backup.create()
    message.value = `Backup created — ${info.name}`
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function archiveNow(): Promise<void> {
  busy.value = true
  message.value = null
  error.value = null
  try {
    const path = await window.cypher.backup.archive()
    message.value = path ? `Archive saved to ${path}` : 'Export cancelled.'
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function revealFolder(): void {
  void window.cypher.backup.reveal()
}

async function removeBackup(b: BackupInfo): Promise<void> {
  await window.cypher.backup.remove(b.path)
  await refresh()
}

async function doRestore(): Promise<void> {
  if (!confirmRestore.value) return
  busy.value = true
  try {
    await window.cypher.backup.restore(confirmRestore.value.path)
    await refresh()
    message.value = 'Backup restored.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
  confirmRestore.value = null
}

onMounted(refresh)
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-6">
    <div class="mb-1 flex items-center gap-2">
      <ShieldCheck :size="18" class="text-accent" />
      <h2 class="text-lg font-semibold">Data safety</h2>
    </div>
    <p class="mb-4 text-sm text-ink-dim">
      Automatic local backups of your database, plus a full archive you can keep off this machine.
    </p>

    <p v-if="message" class="mb-3 break-all rounded-lg bg-accent-soft px-3 py-2 text-xs">{{ message }}</p>
    <p v-if="error" class="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{{ error }}</p>

    <!-- automatic backups -->
    <div class="mb-5 space-y-3">
      <label class="flex items-center gap-2 text-sm">
        <input
          v-model="enabled"
          type="checkbox"
          class="h-4 w-4"
          style="accent-color: var(--color-accent)"
          @change="set('backupEnabled', enabled)"
        />
        Back up automatically
      </label>

      <div :class="enabled ? '' : 'pointer-events-none opacity-50'">
        <div class="mb-1 text-xs text-ink-dim">How often</div>
        <div class="mb-3 grid grid-cols-4 gap-1">
          <button
            v-for="i in INTERVALS"
            :key="i.v"
            class="rounded-lg border px-2 py-1.5 text-xs"
            :class="intervalHours === i.v ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
            @click="intervalHours = i.v; set('backupIntervalHours', i.v)"
          >
            {{ i.label }}
          </button>
        </div>

        <div class="mb-1 text-xs text-ink-dim">Keep the most recent</div>
        <div class="flex items-center gap-2">
          <input
            v-model.number="keep"
            type="number"
            min="1"
            max="100"
            class="w-20 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent-line"
            @change="set('backupKeep', keep)"
          />
          <span class="text-xs text-ink-dim">backups (older ones are removed)</span>
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <button
          class="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
          :disabled="busy"
          @click="backupNow"
        >
          <Loader2 v-if="busy" :size="15" class="animate-spin" />
          <ShieldCheck v-else :size="15" />
          Back up now
        </button>
        <button
          class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink"
          @click="revealFolder"
        >
          <FolderOpen :size="15" /> Open folder
        </button>
        <span class="ml-auto text-xs text-ink-dim">Last: {{ fmtDate(lastBackupAt) }}</span>
      </div>
    </div>

    <!-- backup list -->
    <div class="mb-5">
      <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Available backups ({{ backups.length }})
      </div>
      <div v-if="!backups.length" class="text-xs text-ink-dim">No backups yet.</div>
      <ul v-else class="max-h-56 space-y-1 overflow-auto">
        <li
          v-for="b in backups"
          :key="b.path"
          class="group flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-xs"
        >
          <span class="min-w-0 flex-1 truncate font-mono">{{ b.name }}</span>
          <span class="shrink-0 text-ink-dim">{{ fmtSize(b.size) }}</span>
          <button
            class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
            title="Restore this backup"
            @click="confirmRestore = b"
          >
            <RotateCcw :size="13" />
          </button>
          <button
            class="shrink-0 rounded p-1 text-ink-dim opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            title="Delete this backup"
            @click="removeBackup(b)"
          >
            <Trash2 :size="13" />
          </button>
        </li>
      </ul>
    </div>

    <!-- archive -->
    <div class="border-t border-border pt-4">
      <div class="mb-1 text-sm font-semibold">Full archive</div>
      <p class="mb-3 text-xs text-ink-dim">
        A single zip containing your database and every cover, portrait, and imported book — save it
        to a drive or cloud folder so a dead laptop can't take your work with it.
      </p>
      <div class="mb-3">
        <div class="mb-1 text-xs text-ink-dim">Remind me to archive</div>
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="c in (['off', 'weekly', 'monthly'] as const)"
            :key="c"
            class="rounded-lg border px-2 py-1.5 text-xs capitalize"
            :class="cadence === c ? 'border-accent text-accent' : 'border-border text-ink-dim hover:text-ink'"
            @click="cadence = c; set('archiveReminder', c)"
          >
            {{ c }}
          </button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-60"
          :disabled="busy"
          @click="archiveNow"
        >
          <Download :size="15" /> Export everything…
        </button>
        <span class="ml-auto text-xs text-ink-dim">Last: {{ fmtDate(lastArchiveAt) }}</span>
      </div>
    </div>

    <!-- restore confirmation -->
    <div
      v-if="confirmRestore"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="confirmRestore = null"
    >
      <div class="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 class="mb-2 text-lg font-bold">Restore this backup?</h2>
        <p class="mb-3 text-sm text-ink-dim">
          Your current data will be replaced by
          <span class="font-mono text-xs text-ink">{{ confirmRestore.name }}</span
          >. A snapshot of the current state is saved first, so this can be undone by restoring that.
        </p>
        <p class="mb-5 text-sm text-ink-dim">The app reloads to finish — no restart needed.</p>
        <div class="flex justify-end gap-2">
          <button class="rounded-xl px-4 py-2 text-sm font-medium text-ink-dim hover:text-ink" @click="confirmRestore = null">
            Cancel
          </button>
          <button class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90" @click="doRestore">
            Restore &amp; restart
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
