import { contextBridge, ipcRenderer } from 'electron'
import type {
  Book,
  CreateBookInput,
  UpdateBookInput,
  Chapter,
  CreateChapterOptions,
  ChapterPlacement,
  Volume,
  Goal,
  Checkin,
  LoreEntry,
  CreateLoreOptions,
  Character,
  CreateCharacterOptions,
  ReaderItem,
  ReaderImportResult,
  Note,
  UpdateNoteInput
} from '@shared/types'

const cypher = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  settings: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    getAll: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: unknown): Promise<boolean> =>
      ipcRenderer.invoke('settings:set', key, value)
  },

  db: {
    info: (): Promise<{ path: string; version: number; tables: number; tableNames: string[] }> =>
      ipcRenderer.invoke('db:info')
  },

  books: {
    list: (includeArchived?: boolean): Promise<Book[]> =>
      ipcRenderer.invoke('books:list', includeArchived),
    get: (id: number): Promise<Book | null> => ipcRenderer.invoke('books:get', id),
    create: (input: CreateBookInput): Promise<Book> => ipcRenderer.invoke('books:create', input),
    update: (id: number, patch: UpdateBookInput): Promise<Book | null> =>
      ipcRenderer.invoke('books:update', id, patch),
    archive: (id: number, archived: boolean): Promise<Book | null> =>
      ipcRenderer.invoke('books:archive', id, archived),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('books:delete', id),
    importCover: (): Promise<string | null> => ipcRenderer.invoke('books:importCover')
  },

  chapters: {
    list: (bookId: number): Promise<Chapter[]> => ipcRenderer.invoke('chapters:list', bookId),
    ensureFirst: (bookId: number): Promise<Chapter[]> =>
      ipcRenderer.invoke('chapters:ensureFirst', bookId),
    get: (id: number): Promise<Chapter | null> => ipcRenderer.invoke('chapters:get', id),
    create: (bookId: number, opts?: CreateChapterOptions): Promise<Chapter> =>
      ipcRenderer.invoke('chapters:create', bookId, opts),
    rename: (id: number, title: string): Promise<Chapter | null> =>
      ipcRenderer.invoke('chapters:rename', id, title),
    saveContent: (id: number, content: string, wordCount: number): Promise<Chapter | null> =>
      ipcRenderer.invoke('chapters:saveContent', id, content, wordCount),
    applyOrder: (items: ChapterPlacement[]): Promise<void> =>
      ipcRenderer.invoke('chapters:applyOrder', items),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('chapters:delete', id)
  },

  volumes: {
    list: (bookId: number): Promise<Volume[]> => ipcRenderer.invoke('volumes:list', bookId),
    create: (bookId: number, title?: string): Promise<Volume> =>
      ipcRenderer.invoke('volumes:create', bookId, title),
    rename: (id: number, title: string): Promise<Volume | null> =>
      ipcRenderer.invoke('volumes:rename', id, title),
    remove: (id: number, deleteChapters?: boolean): Promise<void> =>
      ipcRenderer.invoke('volumes:delete', id, deleteChapters),
    reorder: (orderedIds: number[]): Promise<void> =>
      ipcRenderer.invoke('volumes:reorder', orderedIds)
  },

  goals: {
    get: (ownerType: string, ownerId: number): Promise<Goal | null> =>
      ipcRenderer.invoke('goals:get', ownerType, ownerId),
    upsert: (
      ownerType: string,
      ownerId: number,
      targetWords: number,
      deadline?: string | null,
      writingDays?: number[]
    ): Promise<Goal> =>
      ipcRenderer.invoke('goals:upsert', ownerType, ownerId, targetWords, deadline, writingDays),
    remove: (ownerType: string, ownerId: number): Promise<void> =>
      ipcRenderer.invoke('goals:delete', ownerType, ownerId)
  },

  checkins: {
    list: (ownerType: string, ownerId: number, since?: string): Promise<Checkin[]> =>
      ipcRenderer.invoke('checkins:list', ownerType, ownerId, since),
    snapshot: (
      ownerType: string,
      ownerId: number,
      date: string,
      totalWords: number
    ): Promise<Checkin> =>
      ipcRenderer.invoke('checkins:snapshot', ownerType, ownerId, date, totalWords),
    setMood: (
      ownerType: string,
      ownerId: number,
      date: string,
      mood: string | null,
      note: string | null
    ): Promise<Checkin> =>
      ipcRenderer.invoke('checkins:setMood', ownerType, ownerId, date, mood, note)
  },

  lore: {
    list: (bookId: number): Promise<LoreEntry[]> => ipcRenderer.invoke('lore:list', bookId),
    get: (id: number): Promise<LoreEntry | null> => ipcRenderer.invoke('lore:get', id),
    create: (bookId: number, opts?: CreateLoreOptions): Promise<LoreEntry> =>
      ipcRenderer.invoke('lore:create', bookId, opts),
    rename: (id: number, title: string): Promise<LoreEntry | null> =>
      ipcRenderer.invoke('lore:rename', id, title),
    setCategory: (id: number, category: string): Promise<LoreEntry | null> =>
      ipcRenderer.invoke('lore:setCategory', id, category),
    saveContent: (id: number, content: string): Promise<LoreEntry | null> =>
      ipcRenderer.invoke('lore:saveContent', id, content),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('lore:delete', id)
  },

  characters: {
    list: (bookId: number): Promise<Character[]> =>
      ipcRenderer.invoke('characters:list', bookId),
    get: (id: number): Promise<Character | null> => ipcRenderer.invoke('characters:get', id),
    create: (bookId: number, opts?: CreateCharacterOptions): Promise<Character> =>
      ipcRenderer.invoke('characters:create', bookId, opts),
    rename: (id: number, name: string): Promise<Character | null> =>
      ipcRenderer.invoke('characters:rename', id, name),
    setFolder: (id: number, folder: string | null): Promise<Character | null> =>
      ipcRenderer.invoke('characters:setFolder', id, folder),
    saveFields: (id: number, fieldsJson: string): Promise<Character | null> =>
      ipcRenderer.invoke('characters:saveFields', id, fieldsJson),
    setImage: (id: number, imagePath: string | null): Promise<Character | null> =>
      ipcRenderer.invoke('characters:setImage', id, imagePath),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('characters:delete', id),
    importImage: (): Promise<string | null> => ipcRenderer.invoke('characters:importImage')
  },

  notes: {
    list: (ownerType: string, ownerId: number): Promise<Note[]> =>
      ipcRenderer.invoke('notes:list', ownerType, ownerId),
    create: (ownerType: string, ownerId: number): Promise<Note> =>
      ipcRenderer.invoke('notes:create', ownerType, ownerId),
    update: (id: number, patch: UpdateNoteInput): Promise<Note | null> =>
      ipcRenderer.invoke('notes:update', id, patch),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('notes:delete', id)
  },

  reader: {
    list: (): Promise<ReaderItem[]> => ipcRenderer.invoke('reader:list'),
    get: (id: number): Promise<ReaderItem | null> => ipcRenderer.invoke('reader:get', id),
    import: (): Promise<ReaderImportResult | null> => ipcRenderer.invoke('reader:import'),
    deleteSource: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('reader:deleteSource', path),
    rename: (id: number, title: string): Promise<ReaderItem | null> =>
      ipcRenderer.invoke('reader:rename', id, title),
    setAuthor: (id: number, author: string | null): Promise<ReaderItem | null> =>
      ipcRenderer.invoke('reader:setAuthor', id, author),
    importCover: (id: number): Promise<ReaderItem | null> =>
      ipcRenderer.invoke('reader:importCover', id),
    setLocation: (id: number, location: string | null): Promise<ReaderItem | null> =>
      ipcRenderer.invoke('reader:setLocation', id, location),
    remove: (id: number): Promise<boolean> => ipcRenderer.invoke('reader:delete', id),
    fileData: (id: number): Promise<ArrayBuffer | null> =>
      ipcRenderer.invoke('reader:fileData', id)
  }
}

export type CypherApi = typeof cypher

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('cypher', cypher)
  } catch (error) {
    console.error('[preload] failed to expose API:', error)
  }
} else {
  // @ts-ignore - attach to window
  window.cypher = cypher
}
