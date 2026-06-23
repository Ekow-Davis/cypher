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
  applyChapterOrder,
  deleteChapter
} from './db/repositories/chapters'
import {
  listVolumes,
  createVolume,
  renameVolume,
  deleteVolume,
  reorderVolumes
} from './db/repositories/volumes'
import { getGoal, upsertGoal, deleteGoal } from './db/repositories/goals'
import {
  listCheckins,
  snapshotProgress,
  setMood
} from './db/repositories/checkins'
import { importCover } from './assets'
import type { CreateBookInput, UpdateBookInput, CreateChapterOptions, ChapterPlacement } from '@shared/types'

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
  ipcMain.handle('chapters:create', (_e, bookId: number, opts?: CreateChapterOptions) =>
    createChapter(bookId, opts)
  )
  ipcMain.handle('chapters:rename', (_e, id: number, title: string) => renameChapter(id, title))
  ipcMain.handle('chapters:saveContent', (_e, id: number, content: string, wordCount: number) =>
    saveChapterContent(id, content, wordCount)
  )
  ipcMain.handle('chapters:applyOrder', (_e, items: ChapterPlacement[]) => applyChapterOrder(items))
  ipcMain.handle('chapters:delete', (_e, id: number) => deleteChapter(id))

  // Volumes
  ipcMain.handle('volumes:list', (_e, bookId: number) => listVolumes(bookId))
  ipcMain.handle('volumes:create', (_e, bookId: number, title?: string) =>
    createVolume(bookId, title)
  )
  ipcMain.handle('volumes:rename', (_e, id: number, title: string) => renameVolume(id, title))
  ipcMain.handle('volumes:delete', (_e, id: number, deleteChapters?: boolean) =>
    deleteVolume(id, !!deleteChapters)
  )
  ipcMain.handle('volumes:reorder', (_e, orderedIds: number[]) => reorderVolumes(orderedIds))

  // Goals
  ipcMain.handle('goals:get', (_e, ownerType: string, ownerId: number) =>
    getGoal(ownerType, ownerId)
  )
  ipcMain.handle(
    'goals:upsert',
    (
      _e,
      ownerType: string,
      ownerId: number,
      targetWords: number,
      deadline?: string | null,
      writingDays?: number[]
    ) => upsertGoal(ownerType, ownerId, targetWords, deadline ?? null, writingDays ?? [])
  )
  ipcMain.handle('goals:delete', (_e, ownerType: string, ownerId: number) =>
    deleteGoal(ownerType, ownerId)
  )

  // Check-ins (daily progress + mood)
  ipcMain.handle('checkins:list', (_e, ownerType: string, ownerId: number, since?: string) =>
    listCheckins(ownerType, ownerId, since)
  )
  ipcMain.handle(
    'checkins:snapshot',
    (_e, ownerType: string, ownerId: number, date: string, totalWords: number) =>
      snapshotProgress(ownerType, ownerId, date, totalWords)
  )
  ipcMain.handle(
    'checkins:setMood',
    (
      _e,
      ownerType: string,
      ownerId: number,
      date: string,
      mood?: string | null,
      note?: string | null
    ) => setMood(ownerType, ownerId, date, mood ?? null, note ?? null)
  )
}
