import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Diary, DiaryEntry, DiarySecurityStatus } from '@shared/types'

/**
 * Diary session state.
 *
 * Deliberately holds no key material — passwords go to main, and only main
 * ever holds the unwrapped content key. This store tracks whether the diary is
 * open and what has been decrypted for display, so a renderer crash or reload
 * can never leak anything beyond what was already on screen.
 */
export const useDiaryStore = defineStore('diary', () => {
  const status = ref<DiarySecurityStatus>({
    configured: false,
    locked: false,
    lockedUntil: null,
    failCount: 0
  })
  const unlocked = ref(false)
  const translated = ref(false)
  const translateRemaining = ref(0)

  const diaries = ref<Diary[]>([])
  const entries = ref<DiaryEntry[]>([])
  /** null = standalone "vent" entries, which belong to no diary. */
  const activeDiaryId = ref<number | null>(null)
  const activeEntryId = ref<number | null>(null)
  const lastError = ref<string | null>(null)

  const activeEntry = computed<DiaryEntry | null>(
    () => entries.value.find((e) => e.id === activeEntryId.value) ?? null
  )
  const activeDiary = computed<Diary | null>(
    () => diaries.value.find((d) => d.id === activeDiaryId.value) ?? null
  )

  /** Entries bucketed by month, newest first — the spec's month grouping. */
  const entriesByMonth = computed(() => {
    const map = new Map<string, DiaryEntry[]>()
    for (const entry of entries.value) {
      const key = entry.month_group ?? 'undated'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => ({ month, items }))
  })

  async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      lastError.value = null
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      let hint = ''
      if (/No handler registered|Cannot read propert.*undefined|is not a function|no such/i.test(msg)) {
        hint =
          ' — the main process is a version behind. Fully stop the dev server (Ctrl+C) and run "npm run dev" again.'
      }
      lastError.value = `${label} failed: ${msg}${hint}`
      console.error('[diary]', label, e)
      return undefined
    }
  }

  async function refreshStatus(): Promise<void> {
    const s = await guard('Check diary', () => window.cypher.diary.status())
    if (s) status.value = s
    unlocked.value = (await guard('Check lock', () => window.cypher.diary.isUnlocked())) ?? false
    translated.value =
      (await guard('Check translation', () => window.cypher.diary.isTranslated())) ?? false
    translateRemaining.value =
      (await guard('Check window', () => window.cypher.diary.translateRemaining())) ?? 0
  }

  async function setup(entryPass: string, translatePass: string): Promise<boolean> {
    const result = await guard('Set up diary', () =>
      window.cypher.diary.setup(entryPass, translatePass)
    )
    if (!result?.ok) return false
    await refreshStatus()
    await loadAll()
    return true
  }

  async function unlock(password: string): Promise<{ ok: boolean; message?: string }> {
    const result = await guard('Unlock', () => window.cypher.diary.unlock(password))
    await refreshStatus()
    if (result?.ok) {
      await loadAll()
      return { ok: true }
    }
    if (result?.reason === 'locked') {
      return { ok: false, message: 'Too many attempts. Try again shortly.' }
    }
    return { ok: false, message: 'That password is not right.' }
  }

  async function lock(): Promise<void> {
    await guard('Lock', () => window.cypher.diary.lock())
    unlocked.value = false
    translated.value = false
    entries.value = []
    diaries.value = []
    activeEntryId.value = null
  }

  async function unlockTranslation(password: string): Promise<boolean> {
    const result = await guard('Translate', () =>
      window.cypher.diary.unlockTranslation(password)
    )
    await refreshStatus()
    return !!result?.ok
  }

  async function lockTranslation(): Promise<void> {
    await guard('Hide translation', () => window.cypher.diary.lockTranslation())
    translated.value = false
    translateRemaining.value = 0
  }

  async function loadAll(): Promise<void> {
    const list = await guard('Load diaries', () => window.cypher.diary.listDiaries())
    diaries.value = list ?? []
    await loadEntries()
  }

  async function loadEntries(): Promise<void> {
    const list = await guard('Load entries', () =>
      window.cypher.diary.listEntries(activeDiaryId.value)
    )
    entries.value = list ?? []
    if (!entries.value.some((e) => e.id === activeEntryId.value)) {
      activeEntryId.value = entries.value[0]?.id ?? null
    }
  }

  async function selectDiary(id: number | null): Promise<void> {
    activeDiaryId.value = id
    activeEntryId.value = null
    await loadEntries()
  }

  async function addDiary(name: string): Promise<void> {
    const created = await guard('Create diary', () => window.cypher.diary.createDiary(name))
    if (created) {
      diaries.value.push(created)
      await selectDiary(created.id)
    }
  }

  async function renameDiary(id: number, name: string): Promise<void> {
    const updated = await guard('Rename diary', () => window.cypher.diary.renameDiary(id, name))
    if (updated) {
      const existing = diaries.value.find((d) => d.id === id)
      if (existing) Object.assign(existing, updated)
    }
  }

  async function removeDiary(id: number): Promise<void> {
    await guard('Delete diary', () => window.cypher.diary.deleteDiary(id))
    diaries.value = diaries.value.filter((d) => d.id !== id)
    if (activeDiaryId.value === id) await selectDiary(null)
  }

  async function addEntry(title = 'New entry'): Promise<void> {
    const created = await guard('Create entry', () =>
      window.cypher.diary.createEntry({ diaryId: activeDiaryId.value, title, content: '' })
    )
    if (created) {
      entries.value.unshift(created)
      activeEntryId.value = created.id
    }
  }

  async function saveEntry(id: number, title: string, content: string): Promise<void> {
    const updated = await guard('Save entry', () =>
      window.cypher.diary.saveEntry(id, title, content)
    )
    if (updated) {
      const existing = entries.value.find((e) => e.id === id)
      if (existing) Object.assign(existing, updated)
    }
  }

  async function removeEntry(id: number): Promise<void> {
    await guard('Delete entry', () => window.cypher.diary.deleteEntry(id))
    const wasActive = activeEntryId.value === id
    entries.value = entries.value.filter((e) => e.id !== id)
    if (wasActive) activeEntryId.value = entries.value[0]?.id ?? null
  }

  function setActiveEntry(id: number): void {
    activeEntryId.value = id
  }

  function clearError(): void {
    lastError.value = null
  }

  return {
    status,
    unlocked,
    translated,
    translateRemaining,
    diaries,
    entries,
    activeDiaryId,
    activeEntryId,
    activeEntry,
    activeDiary,
    entriesByMonth,
    lastError,
    refreshStatus,
    setup,
    unlock,
    lock,
    unlockTranslation,
    lockTranslation,
    loadAll,
    loadEntries,
    selectDiary,
    addDiary,
    renameDiary,
    removeDiary,
    addEntry,
    saveEntry,
    removeEntry,
    setActiveEntry,
    clearError
  }
})
