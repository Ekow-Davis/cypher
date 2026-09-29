import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TimelineItem, TimelineKind, TimelineUpsert } from '@shared/types'

/** The open book's in-world timeline. */
export const useTimelineStore = defineStore('timeline', () => {
  const items = ref<TimelineItem[]>([])
  const bookId = ref<number | null>(null)
  /**
   * How this book counts time: the unit ("Year", "Day", "Cycle") and an
   * optional era suffix ("AE"). Only affects how numbers read.
   */
  const scale = ref<{ unit: string; suffix: string }>({ unit: 'Year', suffix: '' })

  async function loadForBook(id: number): Promise<void> {
    bookId.value = id
    try {
      items.value = await window.cypher.timeline.list(id)
    } catch {
      items.value = []
    }
    try {
      const raw = (await window.cypher.settings.get(`timelineScale:${id}`)) as
        | { unit?: string; suffix?: string }
        | null
      scale.value = { unit: raw?.unit?.trim() || 'Year', suffix: raw?.suffix?.trim() ?? '' }
    } catch {
      scale.value = { unit: 'Year', suffix: '' }
    }
  }

  async function setScale(unit: string, suffix: string): Promise<void> {
    scale.value = { unit: unit.trim() || 'Year', suffix: suffix.trim() }
    if (bookId.value != null) {
      await window.cypher.settings.set(`timelineScale:${bookId.value}`, { ...scale.value })
    }
  }

  /** 312 → "Year 312 AE"; fractions kept to two places. */
  function formatTime(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return ''
    const n = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
    const { unit, suffix } = scale.value
    return `${unit ? `${unit} ` : ''}${n}${suffix ? ` ${suffix}` : ''}`
  }

  /** The label if one was given, otherwise the formatted number(s). */
  function describe(item: TimelineItem): string {
    if (item.label) return item.label
    return item.end_at != null
      ? `${formatTime(item.start_at)} – ${formatTime(item.end_at)}`
      : formatTime(item.start_at)
  }

  async function refresh(): Promise<void> {
    if (bookId.value != null) await loadForBook(bookId.value)
  }

  /** The row dating a chapter, entry or character, if it has one. */
  function itemFor(kind: TimelineKind, refId: number): TimelineItem | null {
    return items.value.find((i) => i.kind === kind && i.ref_id === refId) ?? null
  }

  const byRef = computed(() => {
    const map = new Map<string, TimelineItem>()
    for (const i of items.value) if (i.ref_id != null) map.set(`${i.kind}:${i.ref_id}`, i)
    return map
  })

  async function save(input: Omit<TimelineUpsert, 'bookId'>): Promise<TimelineItem | null> {
    if (bookId.value == null) return null
    const saved = await window.cypher.timeline.upsert({ ...input, bookId: bookId.value })
    if (saved) {
      const i = items.value.findIndex((x) => x.id === saved.id)
      if (i === -1) items.value = [...items.value, saved]
      else items.value.splice(i, 1, saved)
    }
    return saved
  }

  async function remove(id: number): Promise<void> {
    await window.cypher.timeline.remove(id)
    items.value = items.value.filter((i) => i.id !== id)
  }

  return {
    items,
    bookId,
    scale,
    byRef,
    loadForBook,
    refresh,
    setScale,
    formatTime,
    describe,
    itemFor,
    save,
    remove
  }
})
