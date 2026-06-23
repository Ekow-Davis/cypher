import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Goal, Checkin } from '@shared/types'

const OWNER = 'book'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export const useInsightsStore = defineStore('insights', () => {
  const goal = ref<Goal | null>(null)
  const checkins = ref<Checkin[]>([])
  const bookId = ref<number | null>(null)

  function todayStr(): string {
    return ymd(new Date())
  }

  async function loadForBook(id: number): Promise<void> {
    bookId.value = id
    const [g, cs] = await Promise.all([
      window.cypher.goals.get(OWNER, id),
      window.cypher.checkins.list(OWNER, id)
    ])
    goal.value = g
    checkins.value = cs
  }

  async function setGoal(targetWords: number, deadline: string | null): Promise<void> {
    if (bookId.value == null) return
    goal.value = await window.cypher.goals.upsert(OWNER, bookId.value, targetWords, deadline, [])
  }

  async function clearGoal(): Promise<void> {
    if (bookId.value == null) return
    await window.cypher.goals.remove(OWNER, bookId.value)
    goal.value = null
  }

  async function snapshot(totalWords: number): Promise<void> {
    if (bookId.value == null) return
    mergeCheckin(await window.cypher.checkins.snapshot(OWNER, bookId.value, todayStr(), totalWords))
  }

  async function saveMood(mood: string | null, note: string | null): Promise<void> {
    if (bookId.value == null) return
    mergeCheckin(await window.cypher.checkins.setMood(OWNER, bookId.value, todayStr(), mood, note))
  }

  function mergeCheckin(c: Checkin): void {
    const i = checkins.value.findIndex((x) => x.date === c.date)
    if (i !== -1) checkins.value[i] = c
    else checkins.value.push(c)
  }

  const today = computed<Checkin | null>(
    () => checkins.value.find((c) => c.date === todayStr()) ?? null
  )
  const wordsToday = computed(() => today.value?.words_written ?? 0)

  // Consecutive days (ending today, or yesterday if today not yet written) with words.
  const streak = computed(() => {
    const written = new Set(checkins.value.filter((c) => c.words_written > 0).map((c) => c.date))
    const cursor = new Date()
    if (!written.has(ymd(cursor))) cursor.setDate(cursor.getDate() - 1)
    let count = 0
    while (written.has(ymd(cursor))) {
      count++
      cursor.setDate(cursor.getDate() - 1)
    }
    return count
  })

  // Last `days` days as { date, words } for the activity strip (oldest -> newest).
  function recentActivity(days = 14): { date: string; words: number }[] {
    const byDate = new Map(checkins.value.map((c) => [c.date, c.words_written]))
    const out: { date: string; words: number }[] = []
    const cursor = new Date()
    cursor.setDate(cursor.getDate() - (days - 1))
    for (let i = 0; i < days; i++) {
      const ds = ymd(cursor)
      out.push({ date: ds, words: byDate.get(ds) ?? 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }

  return {
    goal,
    checkins,
    bookId,
    loadForBook,
    setGoal,
    clearGoal,
    snapshot,
    saveMood,
    today,
    wordsToday,
    streak,
    recentActivity
  }
})
