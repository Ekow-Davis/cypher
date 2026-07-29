import { app, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
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
  listLore,
  getLore,
  createLore,
  renameLore,
  setLoreCategory,
  saveLoreContent,
  deleteLore
} from './db/repositories/lore'
import {
  listCharacters,
  getCharacter,
  createCharacter,
  renameCharacter,
  setCharacterFolder,
  saveCharacterFields,
  setCharacterImage,
  deleteCharacter
} from './db/repositories/characters'
import {
  listReaderItems,
  getReaderItem,
  createReaderItem,
  renameReaderItem,
  setReaderAuthor,
  setReaderCover,
  updateReaderLocation,
  deleteReaderItem
} from './db/repositories/reader'
import {
  importReaderFile,
  importReaderCover,
  deleteSourceFile,
  deleteReaderAssets
} from './reader'
import {
  listCheckins,
  snapshotProgress,
  setMood
} from './db/repositories/checkins'
import { importCover, importCharacterImage, absoluteAssetPath } from './assets'
import type {
  CreateBookInput,
  UpdateBookInput,
  CreateChapterOptions,
  ChapterPlacement,
  CreateLoreOptions,
  CreateCharacterOptions,
  ReaderItem
} from '@shared/types'

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

  // Lore
  ipcMain.handle('lore:list', (_e, bookId: number) => listLore(bookId))
  ipcMain.handle('lore:get', (_e, id: number) => getLore(id))
  ipcMain.handle('lore:create', (_e, bookId: number, opts?: CreateLoreOptions) =>
    createLore(bookId, opts)
  )
  ipcMain.handle('lore:rename', (_e, id: number, title: string) => renameLore(id, title))
  ipcMain.handle('lore:setCategory', (_e, id: number, category: string) =>
    setLoreCategory(id, category)
  )
  ipcMain.handle('lore:saveContent', (_e, id: number, content: string) =>
    saveLoreContent(id, content)
  )
  ipcMain.handle('lore:delete', (_e, id: number) => deleteLore(id))

  // Characters
  ipcMain.handle('characters:list', (_e, bookId: number) => listCharacters(bookId))
  ipcMain.handle('characters:get', (_e, id: number) => getCharacter(id))
  ipcMain.handle('characters:create', (_e, bookId: number, opts?: CreateCharacterOptions) =>
    createCharacter(bookId, opts)
  )
  ipcMain.handle('characters:rename', (_e, id: number, name: string) => renameCharacter(id, name))
  ipcMain.handle('characters:setFolder', (_e, id: number, folder: string | null) =>
    setCharacterFolder(id, folder)
  )
  ipcMain.handle('characters:saveFields', (_e, id: number, fieldsJson: string) =>
    saveCharacterFields(id, fieldsJson)
  )
  ipcMain.handle('characters:setImage', (_e, id: number, imagePath: string | null) =>
    setCharacterImage(id, imagePath)
  )
  ipcMain.handle('characters:delete', (_e, id: number) => deleteCharacter(id))
  ipcMain.handle('characters:importImage', () => importCharacterImage())

  // Reader
  const withAbs = (it: ReaderItem | null): ReaderItem | null =>
    it ? { ...it, abs_path: absoluteAssetPath(it.file_path) } : null

  ipcMain.handle('reader:list', () => listReaderItems().map((it) => withAbs(it)))
  ipcMain.handle('reader:get', (_e, id: number) => withAbs(getReaderItem(id)))
  ipcMain.handle('reader:import', async () => {
    const f = await importReaderFile()
    if (!f) return null
    const item = createReaderItem({
      title: f.title,
      format: f.format,
      filePath: f.relPath,
      sourcePath: f.sourcePath
    })
    return { item: withAbs(item), sourcePath: f.sourcePath }
  })
  ipcMain.handle('reader:deleteSource', (_e, path: string) => deleteSourceFile(path))
  ipcMain.handle('reader:rename', (_e, id: number, title: string) =>
    withAbs(renameReaderItem(id, title))
  )
  ipcMain.handle('reader:setAuthor', (_e, id: number, author: string | null) =>
    withAbs(setReaderAuthor(id, author))
  )
  ipcMain.handle('reader:importCover', async (_e, id: number) => {
    const cover = await importReaderCover()
    if (!cover) return withAbs(getReaderItem(id))
    return withAbs(setReaderCover(id, cover))
  })
  ipcMain.handle('reader:setLocation', (_e, id: number, location: string | null) =>
    withAbs(updateReaderLocation(id, location))
  )
  ipcMain.handle('reader:delete', (_e, id: number) => {
    const row = deleteReaderItem(id)
    if (row) deleteReaderAssets([row.file_path, row.cover_path])
    return true
  })
  ipcMain.handle('reader:fileData', async (_e, id: number) => {
    const it = getReaderItem(id)
    if (!it) return null
    const buf = await readFile(absoluteAssetPath(it.file_path))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })
}
