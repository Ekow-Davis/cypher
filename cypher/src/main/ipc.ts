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
  updateChapterMeta,
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
import { listNotes, createNote, updateNote, deleteNote } from './db/repositories/notes'
import {
  listTrash,
  restoreTrashItem,
  purgeTrashItem,
  emptyTrash
} from './db/repositories/trash'
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
import { exportBook } from './export'
import { openWindow, windowCount, broadcastDataChanged } from './windows'
import {
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  revealBackups,
  exportArchive,
  archiveDue,
  snoozeArchive
} from './backup'
import type {
  CreateBookInput,
  UpdateBookInput,
  CreateChapterOptions,
  ChapterPlacement,
  CreateLoreOptions,
  CreateCharacterOptions,
  ReaderItem,
  UpdateNoteInput,
  TrashKind,
  UpdateChapterMetaInput,
  ExportFormat,
  ExportOptions
} from '@shared/types'

/**
 * Channels that only read, or that concern app chrome rather than content.
 * These never trigger a cross-window refresh.
 */
const NO_BROADCAST = /^(app|db|settings|window|export):/
const MUTATION = /:(create|update|delete|rename|save[A-Za-z]*|set[A-Za-z]*|apply[A-Za-z]*|reorder|archive|import[A-Za-z]*|remove|snapshot|upsert|empty|purge|restore|ensure[A-Za-z]*)$/

function shouldBroadcast(channel: string): boolean {
  return !NO_BROADCAST.test(channel) && MUTATION.test(channel)
}

/**
 * Registers a handler and, when it changed something, tells the other windows
 * which slice of data to re-read. Deriving the scope from the channel prefix
 * keeps this automatic — new channels join in without extra wiring.
 */
function handle(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const result = await (fn as (e: unknown, ...a: unknown[]) => unknown)(event, ...args)
    if (shouldBroadcast(channel)) {
      broadcastDataChanged(channel.split(':')[0], event.sender.id)
    }
    return result
  })
}

export function registerIpcHandlers(): void {
  // Windows
  handle('window:open', (_e, route: string) => openWindow(route))
  handle('window:count', () => windowCount())

  // App / diagnostics
  handle('app:ping', () => 'pong')
  handle('app:version', () => app.getVersion())
  handle('db:info', () => getDatabaseInfo())

  // Settings
  handle('settings:get', (_e, key: string) => getSetting(key))
  handle('settings:getAll', () => getAllSettings())
  handle('settings:set', (_e, key: string, value: unknown) => setSetting(key, value))

  // Books
  handle('books:list', (_e, includeArchived?: boolean) => listBooks(!!includeArchived))
  handle('books:get', (_e, id: number) => getBook(id))
  handle('books:create', (_e, input: CreateBookInput) => createBook(input))
  handle('books:update', (_e, id: number, patch: UpdateBookInput) => updateBook(id, patch))
  handle('books:archive', (_e, id: number, archived: boolean) => archiveBook(id, archived))
  handle('books:delete', (_e, id: number) => deleteBook(id))
  handle('books:importCover', () => importCover())

  // Chapters
  handle('chapters:list', (_e, bookId: number) => listChapters(bookId))
  handle('chapters:ensureFirst', (_e, bookId: number) => ensureFirstChapter(bookId))
  handle('chapters:get', (_e, id: number) => getChapter(id))
  handle('chapters:create', (_e, bookId: number, opts?: CreateChapterOptions) =>
    createChapter(bookId, opts)
  )
  handle('chapters:rename', (_e, id: number, title: string) => renameChapter(id, title))
  handle('chapters:saveContent', (_e, id: number, content: string, wordCount: number) =>
    saveChapterContent(id, content, wordCount)
  )
  handle('chapters:saveMeta', (_e, id: number, patch: UpdateChapterMetaInput) =>
    updateChapterMeta(id, patch)
  )
  handle('chapters:applyOrder', (_e, items: ChapterPlacement[]) => applyChapterOrder(items))
  handle('chapters:delete', (_e, id: number) => deleteChapter(id))

  // Volumes
  handle('volumes:list', (_e, bookId: number) => listVolumes(bookId))
  handle('volumes:create', (_e, bookId: number, title?: string) =>
    createVolume(bookId, title)
  )
  handle('volumes:rename', (_e, id: number, title: string) => renameVolume(id, title))
  handle('volumes:delete', (_e, id: number, deleteChapters?: boolean) =>
    deleteVolume(id, !!deleteChapters)
  )
  handle('volumes:reorder', (_e, orderedIds: number[]) => reorderVolumes(orderedIds))

  // Goals
  handle('goals:get', (_e, ownerType: string, ownerId: number) =>
    getGoal(ownerType, ownerId)
  )
  handle(
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
  handle('goals:delete', (_e, ownerType: string, ownerId: number) =>
    deleteGoal(ownerType, ownerId)
  )

  // Check-ins (daily progress + mood)
  handle('checkins:list', (_e, ownerType: string, ownerId: number, since?: string) =>
    listCheckins(ownerType, ownerId, since)
  )
  handle(
    'checkins:snapshot',
    (_e, ownerType: string, ownerId: number, date: string, totalWords: number) =>
      snapshotProgress(ownerType, ownerId, date, totalWords)
  )
  handle(
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
  handle('lore:list', (_e, bookId: number) => listLore(bookId))
  handle('lore:get', (_e, id: number) => getLore(id))
  handle('lore:create', (_e, bookId: number, opts?: CreateLoreOptions) =>
    createLore(bookId, opts)
  )
  handle('lore:rename', (_e, id: number, title: string) => renameLore(id, title))
  handle('lore:setCategory', (_e, id: number, category: string) =>
    setLoreCategory(id, category)
  )
  handle('lore:saveContent', (_e, id: number, content: string) =>
    saveLoreContent(id, content)
  )
  handle('lore:delete', (_e, id: number) => deleteLore(id))

  // Characters
  handle('characters:list', (_e, bookId: number) => listCharacters(bookId))
  handle('characters:get', (_e, id: number) => getCharacter(id))
  handle('characters:create', (_e, bookId: number, opts?: CreateCharacterOptions) =>
    createCharacter(bookId, opts)
  )
  handle('characters:rename', (_e, id: number, name: string) => renameCharacter(id, name))
  handle('characters:setFolder', (_e, id: number, folder: string | null) =>
    setCharacterFolder(id, folder)
  )
  handle('characters:saveFields', (_e, id: number, fieldsJson: string) =>
    saveCharacterFields(id, fieldsJson)
  )
  handle('characters:setImage', (_e, id: number, imagePath: string | null) =>
    setCharacterImage(id, imagePath)
  )
  handle('characters:delete', (_e, id: number) => deleteCharacter(id))
  handle('characters:importImage', () => importCharacterImage())

  // Reader
  const withAbs = (it: ReaderItem | null): ReaderItem | null =>
    it ? { ...it, abs_path: absoluteAssetPath(it.file_path) } : null

  handle('reader:list', () => listReaderItems().map((it) => withAbs(it)))
  handle('reader:get', (_e, id: number) => withAbs(getReaderItem(id)))
  handle('reader:import', async () => {
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
  handle('reader:deleteSource', (_e, path: string) => deleteSourceFile(path))
  handle('reader:rename', (_e, id: number, title: string) =>
    withAbs(renameReaderItem(id, title))
  )
  handle('reader:setAuthor', (_e, id: number, author: string | null) =>
    withAbs(setReaderAuthor(id, author))
  )
  handle('reader:importCover', async (_e, id: number) => {
    const cover = await importReaderCover()
    if (!cover) return withAbs(getReaderItem(id))
    return withAbs(setReaderCover(id, cover))
  })
  handle('reader:setLocation', (_e, id: number, location: string | null) =>
    withAbs(updateReaderLocation(id, location))
  )
  handle('reader:delete', (_e, id: number) => {
    const row = deleteReaderItem(id)
    if (row) deleteReaderAssets([row.file_path, row.cover_path])
    return true
  })
  // Export
  handle(
    'export:book',
    (_e, bookId: number, format: ExportFormat, options: ExportOptions) =>
      exportBook(bookId, format, options)
  )

  // Trash
  handle('trash:list', () => listTrash())
  handle('trash:restore', (_e, kind: TrashKind, id: number) => restoreTrashItem(kind, id))
  handle('trash:purge', (_e, kind: TrashKind, id: number) => purgeTrashItem(kind, id))
  handle('trash:empty', () => emptyTrash())

  // Backups & archive
  handle('backup:list', () => listBackups())
  handle('backup:create', () => createBackup())
  handle('backup:delete', (_e, path: string) => deleteBackup(path))
  handle('backup:restore', (_e, path: string) => restoreBackup(path))
  handle('backup:reveal', () => revealBackups())
  handle('backup:archive', () => exportArchive())
  handle('backup:archiveDue', () => archiveDue())
  handle('backup:snoozeArchive', (_e, days?: number) => snoozeArchive(days ?? 3))

  // Notes
  handle('notes:list', (_e, ownerType: string, ownerId: number) =>
    listNotes(ownerType, ownerId)
  )
  handle('notes:create', (_e, ownerType: string, ownerId: number) =>
    createNote(ownerType, ownerId)
  )
  handle('notes:update', (_e, id: number, patch: UpdateNoteInput) => updateNote(id, patch))
  handle('notes:delete', (_e, id: number) => deleteNote(id))

  handle('reader:fileData', async (_e, id: number) => {
    const it = getReaderItem(id)
    if (!it) return null
    const buf = await readFile(absoluteAssetPath(it.file_path))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })
}
