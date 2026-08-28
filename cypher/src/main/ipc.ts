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
  splitChapter,
  importChapters,
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
  setVolumeNumbering,
  deleteVolume,
  reorderVolumes
} from './db/repositories/volumes'
import { getGoal, upsertGoal, deleteGoal } from './db/repositories/goals'
import { listNotes, createNote, updateNote, deleteNote } from './db/repositories/notes'
import {
  listDocuments,
  getDocument,
  createDocument,
  renameDocument,
  saveDocumentContent,
  updateDocumentMeta,
  duplicateDocument,
  deleteDocument
} from './db/repositories/documents'
import { toPrintTemplate, hasRunningText } from './runningText'
import {
  customWords,
  addCustomWord,
  removeCustomWord,
  spellcheckLanguages,
  setSpellcheckLanguages,
  setSpellcheckEnabled,
  isSpellcheckEnabled
} from './contextMenu'
import { lookupWord, thesaurusEnabled } from './thesaurus'
import { importManuscript } from './import/importManuscript'
import { exportCharacterTemplate } from './characters/template'
import { importCharacterSheets } from './characters/import'
import {
  importScriptFont,
  getScriptFont,
  clearScriptFont,
  listLibraryFonts,
  importLibraryFont,
  removeLibraryFont,
  renameLibraryFont
} from './fonts'
import {
  securityStatus,
  setupDiary,
  unlockDiary,
  lockDiary,
  isUnlocked,
  unlockTranslation,
  lockTranslation,
  isTranslated,
  translateRemainingMs,
  changePasswords
} from './diarySecurity'
import {
  listDiaries,
  createDiary,
  renameDiary,
  deleteDiary,
  listEntries,
  createEntry,
  saveEntry,
  deleteEntry,
  listMonthGroups
} from './db/repositories/diary'
import {
  listComments,
  createComment,
  updateComment,
  resolveComment,
  deleteComment
} from './db/repositories/comments'
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
  deleteReaderAssets,
  saveCoverBytes
} from './reader'
import { readEpubMetadata } from './epubMeta'
import { listMarks, createMark, updateMark, deleteMark } from './db/repositories/marks'
import {
  listCheckins,
  snapshotProgress,
  setMood
} from './db/repositories/checkins'
import {
  importCover,
  importCharacterImage,
  importDocImage,
  absoluteAssetPath
} from './assets'
import { exportBook, exportSection } from './export'
import {
  listShares,
  createShare,
  updateShare,
  setShareActive,
  setShareExpiry,
  deleteShare
} from './db/repositories/shares'
import {
  exportShareFile,
  previewShareSize,
  publishShare,
  unpublishShare,
  fetchShareStats,
  shareUrl
} from './share'
import { printHtml, previewHtml } from './print'
import { importDocx } from './docx'
import { exportDocumentAs } from './export/exportDocument'
import { gatherBook } from './export/gather'
import { bookToHtml, documentToHtml } from './export/bookHtml'
import {
  contentToHtml,
  collectFootnotes,
  withFootnotes,
  resolveReferences
} from './export/tiptapToHtml'
import {
  openWindow,
  windowCount,
  broadcastDataChanged,
  isSecondaryWindow,
  closeWindowFor
} from './windows'
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
  CreateMarkInput,
  UpdateMarkInput,
  UpdateNoteInput,
  UpdateDocMetaInput,
  CreateCommentInput,
  CreateEntryInput,
  CreateShareInput,
  ShareScope,
  TrashKind,
  UpdateChapterMetaInput,
  SplitChapterInput,
  ImportedChapterInput,
  ExportFormat,
  ExportOptions,
  SectionKind,
  SectionExportOptions
} from '@shared/types'

/**
 * Channels that only read, or that concern app chrome rather than content.
 * These never trigger a cross-window refresh.
 */
const NO_BROADCAST = /^(app|db|settings|window|export):/
const MUTATION =
  /:(create|update|delete|rename|duplicate|save[A-Za-z]*|set[A-Za-z]*|apply[A-Za-z]*|reorder|archive|import[A-Za-z]*|remove|snapshot|upsert|empty|purge|restore|ensure[A-Za-z]*)$/

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
  handle('window:isSecondary', (e) => isSecondaryWindow(e.sender.id))
  handle('window:close', (e) => closeWindowFor(e.sender.id))

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
  handle('characters:template', () => exportCharacterTemplate())
  handle('characters:importSheets', () => importCharacterSheets())
  handle('chapters:importPick', () => importManuscript())
  handle(
    'chapters:importApply',
    (_e, bookId: number, items: ImportedChapterInput[], volumeId: number | null) =>
      importChapters(bookId, items, volumeId)
  )
  handle('chapters:split', (_e, input: SplitChapterInput) => splitChapter(input))
  handle('chapters:delete', (_e, id: number) => deleteChapter(id))

  // Volumes
  handle('volumes:list', (_e, bookId: number) => listVolumes(bookId))
  handle('volumes:create', (_e, bookId: number, title?: string) =>
    createVolume(bookId, title)
  )
  handle('volumes:setNumbering', (_e, id: number, numbered: boolean, label: string) =>
    setVolumeNumbering(id, numbered, label)
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
    // Prefer the book's own metadata over the filename.
    const meta =
      f.format === 'epub' ? await readEpubMetadata(absoluteAssetPath(f.relPath)) : {}
    let item = createReaderItem({
      title: meta.title || f.title,
      author: meta.author ?? null,
      format: f.format,
      filePath: f.relPath,
      sourcePath: f.sourcePath
    })
    if (meta.cover) {
      const rel = saveCoverBytes(meta.cover.data, meta.cover.ext)
      item = setReaderCover(item.id, rel) ?? item
    }
    return { item: withAbs(item), sourcePath: f.sourcePath }
  })

  /**
   * Re-reads metadata for an item already in the library. EPUBs are handled
   * here; PDFs report back unhandled so the renderer (which has pdf.js and a
   * canvas) can pull their title and render a first-page cover.
   */
  handle('reader:extractMeta', async (_e, id: number) => {
    const existing = getReaderItem(id)
    if (!existing) return { handled: false, item: null }
    if (existing.format !== 'epub') return { handled: false, item: withAbs(existing) }

    const meta = await readEpubMetadata(absoluteAssetPath(existing.file_path))
    let item = existing
    if (meta.title) item = renameReaderItem(id, meta.title) ?? item
    if (meta.author) item = setReaderAuthor(id, meta.author) ?? item
    if (meta.cover) {
      const rel = saveCoverBytes(meta.cover.data, meta.cover.ext)
      item = setReaderCover(id, rel) ?? item
    }
    return { handled: true, item: withAbs(item) }
  })

  handle('reader:setCoverFromImage', (_e, id: number, data: ArrayBuffer, ext: string) => {
    const rel = saveCoverBytes(Buffer.from(data), ext)
    return withAbs(setReaderCover(id, rel))
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
  handle('reader:setLocation', (_e, id: number, location: string | null, progress?: number) =>
    withAbs(updateReaderLocation(id, location, progress))
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

  handle(
    'export:section',
    (
      _e,
      bookId: number,
      kind: SectionKind,
      format: 'docx' | 'pdf',
      options: SectionExportOptions
    ) => exportSection(bookId, kind, format, options)
  )

  // Printing — same HTML pipeline as PDF export, so output matches
  handle('print:document', (_e, id: number) => {
    const doc = getDocument(id)
    if (!doc) return { ok: false, reason: 'Document not found.' }
    const resolved = resolveReferences(doc.content)
    const body = withFootnotes(contentToHtml(resolved), collectFootnotes(resolved))
    return printHtml(documentToHtml(doc.title, body), {
      display: hasRunningText(doc.header, doc.footer),
      header: toPrintTemplate(doc.header, doc.title, doc.header_align),
      footer: toPrintTemplate(doc.footer, doc.title, doc.footer_align)
    })
  })
  handle('print:previewDocument', (_e, id: number) => {
    const doc = getDocument(id)
    if (!doc) return null
    const resolved = resolveReferences(doc.content)
    const body = withFootnotes(contentToHtml(resolved), collectFootnotes(resolved))
    return previewHtml(documentToHtml(doc.title, body), {
      display: hasRunningText(doc.header, doc.footer),
      header: toPrintTemplate(doc.header, doc.title),
      footer: toPrintTemplate(doc.footer, doc.title)
    })
  })
  handle('print:book', (_e, bookId: number, options: ExportOptions) => {
    const data = gatherBook(bookId, options.chapterIds)
    if (!data) return { ok: false, reason: 'Book not found.' }
    if (!data.chapters.length) return { ok: false, reason: 'No chapters selected.' }
    return printHtml(bookToHtml(data, options))
  })

  // Sharing — book content only; there is no path here that can reach the diary.
  handle('share:list', (_e, bookId: number) => listShares(bookId))
  handle('share:create', (_e, input: CreateShareInput) => createShare(input))
  handle(
    'share:update',
    (
      _e,
      id: number,
      patch: { label?: string; scope?: ShareScope; expiresAt?: string | null }
    ) => updateShare(id, patch)
  )
  handle('share:setActive', (_e, id: number, active: boolean) => setShareActive(id, active))
  handle('share:setExpiry', (_e, id: number, expiresAt: string | null) =>
    setShareExpiry(id, expiresAt)
  )
  handle('share:delete', (_e, id: number) => deleteShare(id))
  handle('share:exportFile', (_e, id: number) => exportShareFile(id))
  handle('share:publish', (_e, id: number) => publishShare(id))
  handle('share:unpublish', (_e, id: number) => unpublishShare(id))
  handle('share:stats', (_e, id: number) => fetchShareStats(id))
  handle('share:url', (_e, id: number) => shareUrl(id))
  handle('share:preview', (_e, bookId: number, scope: ShareScope) =>
    previewShareSize(bookId, scope)
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

  // Reading marks
  handle('marks:list', (_e, itemId: number) => listMarks(itemId))
  handle('marks:create', (_e, input: CreateMarkInput) => createMark(input))
  handle('marks:update', (_e, id: number, patch: UpdateMarkInput) => updateMark(id, patch))
  handle('marks:delete', (_e, id: number) => deleteMark(id))

  // Documents
  handle('docs:list', () => listDocuments())
  handle('docs:get', (_e, id: number) => getDocument(id))
  handle('docs:create', (_e, title?: string) => createDocument(title))
  handle('docs:rename', (_e, id: number, title: string) => renameDocument(id, title))
  handle('docs:saveContent', (_e, id: number, content: string) => saveDocumentContent(id, content))
  handle('docs:saveMeta', (_e, id: number, patch: UpdateDocMetaInput) =>
    updateDocumentMeta(id, patch)
  )
  handle('docs:duplicate', (_e, id: number) => duplicateDocument(id))
  handle('docs:delete', (_e, id: number) => deleteDocument(id))
  handle('docs:importImage', () => importDocImage())
  handle('docs:importDocx', () => importDocx())
  handle('docs:exportAs', (_e, id: number, format: 'docx' | 'pdf') =>
    exportDocumentAs(id, format)
  )

  // Diary security
  handle('diary:status', () => securityStatus())
  handle('diary:setup', (_e, entryPass: string, translatePass: string) => {
    setupDiary(entryPass, translatePass)
    return { ok: true }
  })
  handle('diary:unlock', (_e, password: string) => unlockDiary(password))
  handle('diary:lock', () => lockDiary())
  handle('diary:isUnlocked', () => isUnlocked())
  handle('diary:unlockTranslation', (_e, password: string) => unlockTranslation(password))
  handle('diary:lockTranslation', () => lockTranslation())
  handle('diary:isTranslated', () => isTranslated())
  handle('diary:translateRemaining', () => translateRemainingMs())
  handle('diary:changePasswords', (_e, current: string, newEntry: string | null, newTranslate: string | null) =>
    changePasswords(current, newEntry, newTranslate)
  )

  // Diaries & entries — every handler returns [] / null while locked, never
  // throws, so the renderer can treat "locked" as an ordinary empty state.
  handle('diary:listDiaries', () => listDiaries())
  handle('diary:createDiary', (_e, name: string) => createDiary(name))
  handle('diary:renameDiary', (_e, id: number, name: string) => renameDiary(id, name))
  handle('diary:deleteDiary', (_e, id: number) => deleteDiary(id))
  handle('diary:listEntries', (_e, diaryId: number | null) => listEntries(diaryId))
  handle('diary:createEntry', (_e, input: CreateEntryInput) => createEntry(input))
  handle('diary:saveEntry', (_e, id: number, title: string, content: string) =>
    saveEntry(id, title, content)
  )
  handle('diary:deleteEntry', (_e, id: number) => deleteEntry(id))
  handle('diary:monthGroups', (_e, diaryId: number | null) => listMonthGroups(diaryId))

  // Spelling — Chromium's dictionaries, shared by every editor in the app
  handle('spell:enabled', () => isSpellcheckEnabled())
  handle('spell:setEnabled', (_e, enabled: boolean) => setSpellcheckEnabled(enabled))
  handle('spell:languages', () => spellcheckLanguages())
  handle('spell:setLanguages', (_e, languages: string[]) => setSpellcheckLanguages(languages))
  handle('spell:words', () => customWords())
  handle('spell:addWord', (_e, word: string) => addCustomWord(word))
  handle('spell:removeWord', (_e, word: string) => removeCustomWord(word))

  // Thesaurus
  handle('thesaurus:lookup', (_e, word: string) => lookupWord(word))
  handle('thesaurus:enabled', () => thesaurusEnabled())

  // Script font (diary "translation")
  handle('fonts:import', () => importScriptFont())
  handle('fonts:get', () => getScriptFont())
  handle('fonts:list', () => listLibraryFonts())
  handle('fonts:add', () => importLibraryFont())
  handle('fonts:remove', (_e, id: string) => {
    removeLibraryFont(id)
    broadcastDataChanged('fonts')
  })
  handle('fonts:rename', (_e, id: string, family: string) => renameLibraryFont(id, family))
  handle('fonts:clear', async () => {
    clearScriptFont()
    broadcastDataChanged('fonts')
  })

  // Document comments
  handle('comments:list', (_e, documentId: number) => listComments(documentId))
  handle('comments:create', (_e, input: CreateCommentInput) => createComment(input))
  handle('comments:update', (_e, id: number, body: string) => updateComment(id, body))
  handle('comments:resolve', (_e, id: number, resolved: boolean) => resolveComment(id, resolved))
  handle('comments:delete', (_e, id: number) => deleteComment(id))

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
