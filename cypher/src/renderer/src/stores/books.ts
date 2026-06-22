import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Book, CreateBookInput, UpdateBookInput } from '@shared/types'

export const useBooksStore = defineStore('books', () => {
  const books = ref<Book[]>([])
  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      books.value = await window.cypher.books.list()
    } finally {
      loading.value = false
    }
  }

  async function get(id: number): Promise<Book | null> {
    return window.cypher.books.get(id)
  }

  async function create(input: CreateBookInput): Promise<Book> {
    const book = await window.cypher.books.create(input)
    books.value = [book, ...books.value]
    return book
  }

  async function update(id: number, patch: UpdateBookInput): Promise<void> {
    const updated = await window.cypher.books.update(id, patch)
    if (updated) {
      const i = books.value.findIndex((b) => b.id === id)
      if (i !== -1) books.value[i] = updated
    }
  }

  async function importCover(id: number): Promise<void> {
    const coverRef = await window.cypher.books.importCover()
    if (coverRef) await update(id, { cover_path: coverRef })
  }

  async function archive(id: number, archived: boolean): Promise<void> {
    await window.cypher.books.archive(id, archived)
    books.value = books.value.filter((b) => b.id !== id)
  }

  async function remove(id: number): Promise<void> {
    await window.cypher.books.remove(id)
    books.value = books.value.filter((b) => b.id !== id)
  }

  return { books, loading, load, get, create, update, importCover, archive, remove }
})
