<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>

<template>
  <div
    v-if="app.whatsNew.length"
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
    @click.self="app.dismissWhatsNew()"
    @keydown.esc="app.dismissWhatsNew()"
  >
    <div class="flex max-h-[86vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-2xl">
      <div class="flex items-center gap-3 border-b border-border px-6 py-4">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Sparkles :size="18" />
        </span>
        <div>
          <h2 class="text-lg font-bold">What's new</h2>
          <p class="text-sm text-ink-dim">
            Cypher {{ app.whatsNew[0].version }}
            <span v-if="app.whatsNew.length > 1">
              — and {{ app.whatsNew.length - 1 }} earlier update{{ app.whatsNew.length > 2 ? 's' : '' }}
            </span>
          </p>
        </div>
      </div>

      <div class="flex-1 space-y-5 overflow-auto px-6 py-5">
        <section v-for="note in app.whatsNew" :key="note.version">
          <p
            v-if="app.whatsNew.length > 1"
            class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim"
          >
            {{ note.version }}
          </p>
          <ul class="space-y-3">
            <li v-for="h in note.highlights" :key="h.title" class="flex gap-3">
              <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div>
                <div class="text-sm font-semibold">{{ h.title }}</div>
                <p class="text-sm leading-relaxed text-ink-dim">{{ h.body }}</p>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <div class="flex justify-end border-t border-border px-6 py-3">
        <button
          class="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent"
          autofocus
          @click="app.dismissWhatsNew()"
        >
          Got it
        </button>
      </div>
    </div>
  </div>
</template>
