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
  Checkin
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
