<script setup lang="ts">
import { ref, computed } from 'vue'
import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { FileInput, Loader2, AlertCircle, Check, Trash2, Info, ScrollText } from 'lucide-vue-next'
import { createCharacterMention, looseKey } from '@/lib/characterMention'
import { buildRefIndex, resolveHandles } from '@/lib/mentionRefs'
import { useLoreStore } from '@/stores/lore'
import { useCharactersStore } from '@/stores/characters'
import type { LoreImportFile } from '@shared/types'

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ close: [] }>()

const lore = useLoreStore()
const characters = useCharactersStore()

interface Row extends LoreImportFile {
  keep: boolean
}

const rows = ref<Row[]>([])
const category = ref(lore.active?.category ?? 'Imported')
const linkRefs = ref(true)
const picking = ref(false)
const applying = ref(false)
const error = ref<string | null>(null)
const summary = ref<{ entries: number; links: number; unresolved: string[] } | null>(null)

const kept = computed(() => rows.value.filter((r) => r.keep && !r.error))

const existingTitles = computed(() => new Set(lore.entries.map((e) => looseKey(e.title))))
function alreadyExists(title: string): boolean {
  return existingTitles.value.has(looseKey(title))
}

/** Handles in the files, for the preview — resolution itself runs on apply. */
function handleCount(html: string): number {
  return (html.match(/(^|[^\p{L}\p{N}])@[\p{L}\p{N}_'’-]+/gu) ?? []).length
}

async function pick(): Promise<void> {
  picking.value = true
  error.value = null
  try {
    const files = await window.cypher.lore.importPick()
    if (files) rows.value = [...rows.value, ...files.map((f) => ({ ...f, keep: !f.error }))]
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    picking.value = false
  }
}

/**
 * Creates every entry first, then fills them in.
 *
 * Two passes so files in the same batch can reference one another: by the
 * time any body is resolved, every imported title already exists in the codex
 * with an id a reference can point at.
 */
async function apply(): Promise<void> {
  if (!kept.value.length) return
  applying.value = true
  error.value = null
  const cat = category.value.trim() || 'Imported'
  const parser = new Editor({ extensions: [StarterKit, createCharacterMention({ lore: true })] })
  try {
    const created: { id: number; html: string }[] = []
    for (const row of kept.value) {
      const entry = await window.cypher.lore.create(props.bookId, {
        title: row.title.trim() || 'Untitled',
        category: cat
      })
      created.push({ id: entry.id, html: row.html })
    }
    await lore.refresh()

    const index = buildRefIndex(lore.entries, characters.characters)
    let links = 0
    const unresolved = new Set<string>()
    for (const item of created) {
      parser.commands.setContent(item.html || '<p></p>')
      let doc = parser.getJSON()
      if (linkRefs.value) {
        const out = resolveHandles(doc, index)
        doc = out.doc
        links += out.report.count
        out.report.unresolved.forEach((h) => unresolved.add(h))
      }
      await lore.saveContent(item.id, JSON.stringify(doc))
    }
    if (created[0]) lore.setActive(created[0].id)
    summary.value = { entries: created.length, links, unresolved: [...unresolved] }
    rows.value = []
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    parser.destroy()
    applying.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="flex max-h-[86vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-surface">
      <div class="flex items-center gap-2 border-b border-border px-6 py-4">
        <ScrollText :size="18" class="text-accent" />
        <div>
          <h2 class="text-lg font-bold">Import lore</h2>
          <p class="text-sm text-ink-dim">Word, Markdown or text files — one entry per file.</p>
        </div>
      </div>

      <div class="flex-1 space-y-4 overflow-auto px-6 py-4">
        <div v-if="summary" class="rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-sm">
          <div class="flex items-center gap-2 font-medium">
            <Check :size="15" class="text-accent" />
            Imported {{ summary.entries }} entr{{ summary.entries === 1 ? 'y' : 'ies' }}<span
              v-if="linkRefs"
            >, linked {{ summary.links }} reference{{ summary.links === 1 ? '' : 's' }}</span>.
          </div>
          <p v-if="summary.unresolved.length" class="mt-2 text-xs text-ink-dim">
            Left as plain text (no matching entry or character):
            <span class="text-ink">{{ summary.unresolved.slice(0, 12).join(', ') }}</span
            ><span v-if="summary.unresolved.length > 12"> and {{ summary.unresolved.length - 12 }} more</span>.
            Create those entries, then use <em>Link @names</em> in the entry's toolbar.
          </p>
        </div>

        <div class="flex items-start gap-2 rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-ink-dim">
          <Info :size="14" class="mt-0.5 shrink-0 text-accent" />
          <span>
            A leading heading becomes the entry's title. References written as
            <code>@TheCrimsonChapel</code>, <code>@The_Crimson_Chapel</code> or
            <code>@the-crimson-chapel</code> link to an entry or character with that name — including
            other files in this batch.
          </span>
        </div>

        <button
          class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-ink-dim transition-colors hover:border-accent-line hover:text-ink disabled:opacity-60"
          :disabled="picking || applying"
          @click="pick"
        >
          <Loader2 v-if="picking" :size="15" class="animate-spin" />
          <FileInput v-else :size="15" />
          {{ rows.length ? 'Add more files…' : 'Choose files…' }}
        </button>

        <div v-if="rows.length" class="space-y-1.5">
          <div
            v-for="(row, i) in rows"
            :key="`${row.fileName}-${i}`"
            class="rounded-xl border border-border px-3 py-2"
            :class="row.keep && !row.error ? '' : 'opacity-50'"
          >
            <div class="flex items-center gap-2">
              <input
                v-model="row.keep"
                type="checkbox"
                class="h-4 w-4 shrink-0"
                style="accent-color: var(--color-accent)"
                :disabled="!!row.error"
              />
              <input
                v-model="row.title"
                class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:border-border focus:border-accent-line"
                :disabled="!!row.error"
              />
              <button class="shrink-0 rounded p-1 text-ink-dim hover:text-red-400" title="Remove" @click="rows.splice(i, 1)">
                <Trash2 :size="13" />
              </button>
            </div>
            <div class="mt-0.5 flex flex-wrap gap-x-3 pl-6 text-[11px] text-ink-dim">
              <span>{{ row.fileName }}</span>
              <span v-if="!row.error">{{ row.words.toLocaleString() }} words</span>
              <span v-if="!row.error && handleCount(row.html)">{{ handleCount(row.html) }} @ handle(s)</span>
              <span v-if="!row.error && alreadyExists(row.title)" class="text-amber-400">
                An entry with this name exists — this adds a second one
              </span>
              <span v-if="row.error" class="text-red-400">Couldn't read: {{ row.error }}</span>
            </div>
          </div>
        </div>

        <div v-if="rows.length" class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-ink-dim">Category</span>
            <input
              v-model="category"
              list="lore-import-categories"
              class="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent-line"
            />
            <datalist id="lore-import-categories">
              <option v-for="c in lore.categoryNames" :key="c" :value="c" />
            </datalist>
          </label>
          <label class="flex items-center gap-2 self-end pb-1.5 text-sm">
            <input v-model="linkRefs" type="checkbox" class="h-4 w-4" style="accent-color: var(--color-accent)" />
            Link @references
          </label>
        </div>

        <div v-if="error" class="flex items-start gap-2 text-sm text-red-400">
          <AlertCircle :size="15" class="mt-0.5 shrink-0" /> {{ error }}
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-border px-6 py-3">
        <button class="rounded-lg px-3 py-1.5 text-sm text-ink-dim hover:text-ink" @click="emit('close')">
          {{ summary && !rows.length ? 'Done' : 'Cancel' }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
          :disabled="!kept.length || applying"
          @click="apply"
        >
          <Loader2 v-if="applying" :size="14" class="animate-spin" />
          Import {{ kept.length || '' }} entr{{ kept.length === 1 ? 'y' : 'ies' }}
        </button>
      </div>
    </div>
  </div>
</template>
