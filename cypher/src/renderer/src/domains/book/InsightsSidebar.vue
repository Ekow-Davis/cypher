<script setup lang="ts">
import { ref, computed, reactive, watch, onBeforeUnmount } from 'vue'
import {
  Target,
  Flame,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Sparkles,
  Check,
  X
} from 'lucide-vue-next'
import { useChaptersStore } from '@/stores/chapters'
import { useInsightsStore } from '@/stores/insights'
import { extractPlainText, wordFrequency, phraseFrequency, type FreqItem } from '@/lib/textStats'

const chaptersStore = useChaptersStore()
const insights = useInsightsStore()

// ----- live book stats -----
const totalWords = computed(() =>
  chaptersStore.chapters.reduce((sum, c) => sum + (c.word_count || 0), 0)
)
const chapterCount = computed(() => chaptersStore.chapters.length)
const volumeCount = computed(() => chaptersStore.volumes.length)
const readingMins = computed(() => Math.round(totalWords.value / 200))
const readingLabel = computed(() =>
  totalWords.value === 0 ? '—' : readingMins.value < 1 ? '<1 min' : `${readingMins.value} min`
)

// ----- daily snapshot (debounced) -----
let snapTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSnapshot(): void {
  if (snapTimer) clearTimeout(snapTimer)
  snapTimer = setTimeout(() => void insights.snapshot(totalWords.value), 1200)
}
watch(() => [insights.bookId, totalWords.value] as const, scheduleSnapshot, { immediate: true })
onBeforeUnmount(() => {
  if (snapTimer) clearTimeout(snapTimer)
})

// ----- collapsible cards -----
const open = reactive({ progress: true, goal: true, today: true, mood: true, freq: false })

// ----- goal -----
const editingGoal = ref(false)
const goalTarget = ref<number>(50000)
const goalDeadline = ref<string>('')

function startEditGoal(): void {
  goalTarget.value = insights.goal?.target_words ?? 50000
  goalDeadline.value = insights.goal?.deadline ?? ''
  editingGoal.value = true
}
async function saveGoalForm(): Promise<void> {
  if (goalTarget.value > 0) {
    await insights.setGoal(goalTarget.value, goalDeadline.value || null)
  }
  editingGoal.value = false
}
async function clearGoal(): Promise<void> {
  await insights.clearGoal()
  editingGoal.value = false
}

const goalPct = computed(() => {
  const t = insights.goal?.target_words ?? 0
  return t > 0 ? Math.min(100, Math.round((totalWords.value / t) * 100)) : 0
})
const wordsRemaining = computed(() =>
  Math.max(0, (insights.goal?.target_words ?? 0) - totalWords.value)
)
const daysLeft = computed(() => {
  if (!insights.goal?.deadline) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(insights.goal.deadline)
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
})
const perDay = computed(() => {
  if (daysLeft.value == null) return null
  if (daysLeft.value <= 0) return wordsRemaining.value
  return Math.ceil(wordsRemaining.value / daysLeft.value)
})

// ----- today / activity -----
const activity = computed(() => insights.recentActivity(14))
const activityMax = computed(() => Math.max(1, ...activity.value.map((a) => a.words)))

// ----- mood -----
const moods = [
  { emoji: '🤩', value: 'great' },
  { emoji: '🙂', value: 'good' },
  { emoji: '😐', value: 'okay' },
  { emoji: '😕', value: 'low' },
  { emoji: '😞', value: 'rough' }
]
const moodNote = ref('')
watch(
  () => insights.today,
  (t) => {
    moodNote.value = t?.note ?? ''
  },
  { immediate: true }
)
async function pickMood(value: string): Promise<void> {
  const next = insights.today?.mood === value ? null : value
  await insights.saveMood(next, moodNote.value || null)
}
async function commitNote(): Promise<void> {
  await insights.saveMood(insights.today?.mood ?? null, moodNote.value || null)
}

// ----- frequency analysis -----
const topWords = ref<FreqItem[]>([])
const topPhrases = ref<FreqItem[]>([])
const analyzed = ref(false)
function analyze(): void {
  const text = chaptersStore.chapters.map((c) => extractPlainText(c.content)).join(' ')
  topWords.value = wordFrequency(text, 12)
  topPhrases.value = phraseFrequency(text, 2, 8)
  analyzed.value = true
  open.freq = true
}
</script>

<template>
  <aside class="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface/60">
    <div class="border-b border-border px-4 py-3">
      <span class="text-xs font-semibold uppercase tracking-wider text-ink-dim">Goals & Insights</span>
    </div>

    <div class="space-y-3 p-3">
      <!-- PROGRESS -->
      <section class="rounded-xl border border-border bg-surface">
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
          @click="open.progress = !open.progress"
        >
          <BarChart3 :size="15" class="text-accent" />
          Progress
          <component :is="open.progress ? ChevronDown : ChevronRight" :size="14" class="ml-auto text-ink-dim" />
        </button>
        <div v-if="open.progress" class="px-3 pb-3">
          <div class="mb-2 text-3xl font-bold tabular-nums">{{ totalWords.toLocaleString() }}</div>
          <div class="mb-3 text-xs text-ink-dim">total words</div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-lg bg-surface-2 py-2">
              <div class="text-sm font-semibold tabular-nums">{{ chapterCount }}</div>
              <div class="text-[10px] text-ink-dim">chapters</div>
            </div>
            <div class="rounded-lg bg-surface-2 py-2">
              <div class="text-sm font-semibold tabular-nums">{{ volumeCount }}</div>
              <div class="text-[10px] text-ink-dim">volumes</div>
            </div>
            <div class="rounded-lg bg-surface-2 py-2">
              <div class="flex items-center justify-center gap-0.5 text-sm font-semibold">
                <Clock :size="12" />{{ readingLabel }}
              </div>
              <div class="text-[10px] text-ink-dim">read</div>
            </div>
          </div>
        </div>
      </section>

      <!-- GOAL -->
      <section class="rounded-xl border border-border bg-surface">
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
          @click="open.goal = !open.goal"
        >
          <Target :size="15" class="text-accent" />
          Goal
          <component :is="open.goal ? ChevronDown : ChevronRight" :size="14" class="ml-auto text-ink-dim" />
        </button>
        <div v-if="open.goal" class="px-3 pb-3">
          <!-- form -->
          <div v-if="editingGoal || !insights.goal" class="space-y-2">
            <label class="block text-xs text-ink-dim">Target word count</label>
            <input
              v-model.number="goalTarget"
              type="number"
              min="1"
              class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
            />
            <label class="block text-xs text-ink-dim">Deadline (optional)</label>
            <input
              v-model="goalDeadline"
              type="date"
              class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
            />
            <div class="flex gap-2 pt-1">
              <button
                class="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-sm font-semibold text-on-accent"
                @click="saveGoalForm"
              >
                <Check :size="14" /> Save
              </button>
              <button
                v-if="insights.goal"
                class="rounded-lg border border-border px-2 text-ink-dim hover:text-ink"
                title="Cancel"
                @click="editingGoal = false"
              >
                <X :size="14" />
              </button>
            </div>
          </div>

          <!-- summary -->
          <div v-else>
            <div class="mb-1 flex items-baseline justify-between">
              <span class="text-sm font-semibold tabular-nums">{{ goalPct }}%</span>
              <span class="text-xs text-ink-dim tabular-nums">
                {{ totalWords.toLocaleString() }} / {{ insights.goal?.target_words?.toLocaleString() }}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full bg-accent transition-all" :style="{ width: goalPct + '%' }" />
            </div>
            <div class="mt-2 space-y-0.5 text-xs text-ink-dim">
              <div>{{ wordsRemaining.toLocaleString() }} words to go</div>
              <div v-if="daysLeft != null && daysLeft > 0">
                {{ perDay?.toLocaleString() }} words/day &middot; {{ daysLeft }} days left
              </div>
              <div v-else-if="daysLeft != null" class="text-red-400">Deadline passed</div>
            </div>
            <div class="mt-2 flex gap-2">
              <button class="flex items-center gap-1 text-xs text-ink-dim hover:text-ink" @click="startEditGoal">
                <Pencil :size="12" /> Edit
              </button>
              <button class="flex items-center gap-1 text-xs text-ink-dim hover:text-red-400" @click="clearGoal">
                <Trash2 :size="12" /> Clear
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- TODAY -->
      <section class="rounded-xl border border-border bg-surface">
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
          @click="open.today = !open.today"
        >
          <Flame :size="15" class="text-accent" />
          Today
          <component :is="open.today ? ChevronDown : ChevronRight" :size="14" class="ml-auto text-ink-dim" />
        </button>
        <div v-if="open.today" class="px-3 pb-3">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="text-2xl font-bold tabular-nums">+{{ insights.wordsToday.toLocaleString() }}</div>
              <div class="text-[10px] text-ink-dim">words today</div>
            </div>
            <div class="text-right">
              <div class="flex items-center gap-1 text-2xl font-bold tabular-nums">
                <Flame :size="18" class="text-accent" />{{ insights.streak }}
              </div>
              <div class="text-[10px] text-ink-dim">day streak</div>
            </div>
          </div>
          <div class="flex h-10 items-end gap-0.5">
            <div
              v-for="a in activity"
              :key="a.date"
              class="flex-1 rounded-sm"
              :class="a.words > 0 ? 'bg-accent' : 'bg-surface-2'"
              :style="{ height: Math.max(8, (a.words / activityMax) * 100) + '%' }"
              :title="`${a.date}: ${a.words} words`"
            />
          </div>
          <div class="mt-1 text-[10px] text-ink-dim">last 14 days</div>
        </div>
      </section>

      <!-- MOOD -->
      <section class="rounded-xl border border-border bg-surface">
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
          @click="open.mood = !open.mood"
        >
          <span class="text-base leading-none">🌤️</span>
          Mood check-in
          <component :is="open.mood ? ChevronDown : ChevronRight" :size="14" class="ml-auto text-ink-dim" />
        </button>
        <div v-if="open.mood" class="px-3 pb-3">
          <div class="mb-2 flex justify-between">
            <button
              v-for="m in moods"
              :key="m.value"
              class="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-all"
              :class="
                insights.today?.mood === m.value
                  ? 'bg-accent-soft ring-2 ring-accent'
                  : 'bg-surface-2 hover:bg-surface'
              "
              :title="m.value"
              @click="pickMood(m.value)"
            >
              {{ m.emoji }}
            </button>
          </div>
          <textarea
            v-model="moodNote"
            rows="2"
            placeholder="A line about today…"
            class="w-full resize-none rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
            @blur="commitNote"
          />
        </div>
      </section>

      <!-- FREQUENCY -->
      <section class="rounded-xl border border-border bg-surface">
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
          @click="open.freq = !open.freq"
        >
          <Sparkles :size="15" class="text-accent" />
          Text analysis
          <component :is="open.freq ? ChevronDown : ChevronRight" :size="14" class="ml-auto text-ink-dim" />
        </button>
        <div v-if="open.freq" class="px-3 pb-3">
          <button
            class="mb-3 w-full rounded-lg border border-border py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
            @click="analyze"
          >
            {{ analyzed ? 'Re-analyze' : 'Analyze manuscript' }}
          </button>
          <template v-if="analyzed">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
              Frequent words
            </div>
            <div class="mb-3 flex flex-wrap gap-1">
              <span
                v-for="w in topWords"
                :key="w.term"
                class="rounded-full bg-surface-2 px-2 py-0.5 text-xs"
                >{{ w.term }} <span class="text-ink-dim">{{ w.count }}</span></span
              >
              <span v-if="!topWords.length" class="text-xs text-ink-dim">Not enough text yet.</span>
            </div>
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
              Repeated phrases
            </div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="p in topPhrases"
                :key="p.term"
                class="rounded-full bg-surface-2 px-2 py-0.5 text-xs"
                >{{ p.term }} <span class="text-ink-dim">{{ p.count }}</span></span
              >
              <span v-if="!topPhrases.length" class="text-xs text-ink-dim">No repeated phrases.</span>
            </div>
          </template>
        </div>
      </section>
    </div>
  </aside>
</template>
