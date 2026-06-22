import { app, ipcMain } from 'electron'
import { getSetting, getAllSettings, setSetting } from './settings'
import { getDatabaseInfo } from './db'
import {
  listBooks,
  getBook,
  createBook,
  updateBook,
  archiveBook,
  deleteBook
} from './db/repositories/books'
import {
  listChapters,
  getChapter,
  createChapter,
  ensureFirstChapter,
  renameChapter,
  saveChapterContent,
  reorderChapters,
  deleteChapter
} from './db/repositories/chapters'
import { importCover } from './assets'
import type { CreateBookInput, UpdateBookInput } from '@shared/types'

/**
 * Registers every IPC handler the renderer is allowed to call.
 * Each handler is a deliberate, auditable boundary between the UI and
 * privileged operations (disk, crypto, network) that live in main.
 */
export function registerIpcHandlers(): void {
  // App / diagnostics
  ipcMain.handle('app:ping', () => 'pong')
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('db:info', () => getDatabaseInfo())

  // Settings
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:getAll', () => getAllSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => setSetting(key, value))

  // Books
  ipcMain.handle('books:list', (_e, includeArchived?: boolean) => listBooks(!!includeArchived))
  ipcMain.handle('books:get', (_e, id: number) => getBook(id))
  ipcMain.handle('books:create', (_e, input: CreateBookInput) => createBook(input))
  ipcMain.handle('books:update', (_e, id: number, patch: UpdateBookInput) => updateBook(id, patch))
  ipcMain.handle('books:archive', (_e, id: number, archived: boolean) => archiveBook(id, archived))
  ipcMain.handle('books:delete', (_e, id: number) => deleteBook(id))
  ipcMain.handle('books:importCover', () => importCover())

  // Chapters
  ipcMain.handle('chapters:list', (_e, bookId: number) => listChapters(bookId))
  ipcMain.handle('chapters:ensureFirst', (_e, bookId: number) => ensureFirstChapter(bookId))
  ipcMain.handle('chapters:get', (_e, id: number) => getChapter(id))
  ipcMain.handle('chapters:create', (_e, bookId: number, title?: string) =>
    createChapter(bookId, title)
  )
  ipcMain.handle('chapters:rename', (_e, id: number, title: string) => renameChapter(id, title))
  ipcMain.handle('chapters:saveContent', (_e, id: number, content: string, wordCount: number) =>
    saveChapterContent(id, content, wordCount)
  )
  ipcMain.handle('chapters:reorder', (_e, orderedIds: number[]) => reorderChapters(orderedIds))
  ipcMain.handle('chapters:delete', (_e, id: number) => deleteChapter(id))
}
