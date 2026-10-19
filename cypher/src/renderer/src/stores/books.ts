import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Book, CreateBookInput, ShelfFolder, UpdateBookInput } from '@shared/types'

export const useBooksStore = defineStore('books', () => {
  /**
   * Every book that isn't in the trash, archived ones included, so the shelf
   * can show an Archived view. Most of the app wants `active` instead.
   */
  const all = ref<Book[]>([])
  const folders = ref<ShelfFolder[]>([])
  const loading = ref(false)

  const active = computed(() => all.value.filter((b) => !b.archived))
  const archived = computed(() => all.value.filter((b) => !!b.archived))
  /**
   * Kept for the export dialogs and anything else that looks a book up by id:
   * an archived book still exists and can still be exported.
   */
  const books = all

  async function load(): Promise<void> {
    loading.value = true
    try {
      const [list, folderList] = await Promise.all([
        window.cypher.books.list(true),
        window.cypher.shelf.folders()
      ])
      all.value = list
      folders.value = folderList
    } finally {
      loading.value = false
    }
  }

  async function get(id: number): Promise<Book | null> {
    return window.cypher.books.get(id)
  }

  function replace(book: Book | null): void {
    if (!book) return
    const i = all.value.findIndex((b) => b.id === book.id)
    // Keep the list query's summary fields; a single-row read doesn't carry them.
    if (i !== -1) all.value[i] = { ...all.value[i], ...book }
  }

  async function create(input: CreateBookInput): Promise<Book> {
    const book = await window.cypher.books.create(input)
    all.value = [{ ...book, word_count: 0, chapter_count: 0, last_edited: book.created_at }, ...all.value]
    return book
  }

  async function update(id: number, patch: UpdateBookInput): Promise<void> {
    replace(await window.cypher.books.update(id, patch))
  }

  async function importCover(id: number): Promise<void> {
    const coverRef = await window.cypher.books.importCover()
    if (coverRef) await update(id, { cover_path: coverRef })
  }

  async function archive(id: number, isArchived: boolean): Promise<void> {
    replace(await window.cypher.books.archive(id, isArchived))
  }

  async function remove(id: number): Promise<void> {
    await window.cypher.books.remove(id)
    all.value = all.value.filter((b) => b.id !== id)
  }

  // ----- folders -----

  async function createFolder(name: string): Promise<ShelfFolder> {
    const folder = await window.cypher.shelf.createFolder(name)
    folders.value = [...folders.value, folder]
    return folder
  }

  async function renameFolder(id: number, name: string): Promise<void> {
    const folder = await window.cypher.shelf.renameFolder(id, name)
    if (folder) folders.value = folders.value.map((f) => (f.id === id ? folder : f))
  }

  async function deleteFolder(id: number): Promise<void> {
    await window.cypher.shelf.deleteFolder(id)
    folders.value = folders.value.filter((f) => f.id !== id)
    for (const b of all.value) if (b.folder_id === id) b.folder_id = null
  }

  async function moveToFolder(bookId: number, folderId: number | null): Promise<void> {
    replace(await window.cypher.books.setFolder(bookId, folderId))
  }

  return {
    books,
    all,
    active,
    archived,
    folders,
    loading,
    load,
    get,
    create,
    update,
    importCover,
    archive,
    remove,
    createFolder,
    renameFolder,
    deleteFolder,
    moveToFolder
  }
})
