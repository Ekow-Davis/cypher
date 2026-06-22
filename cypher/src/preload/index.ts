import { contextBridge, ipcRenderer } from 'electron'
import type { Book, CreateBookInput, UpdateBookInput, Chapter } from '@shared/types'

/**
 * The secure bridge. Everything the renderer may ask the main process to
 * do is listed here explicitly. The renderer never receives direct access
 * to Node, the filesystem, or ipcRenderer itself.
 */
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
    create: (bookId: number, title?: string): Promise<Chapter> =>
      ipcRenderer.invoke('chapters:create', bookId, title),
    rename: (id: number, title: string): Promise<Chapter | null> =>
      ipcRenderer.invoke('chapters:rename', id, title),
    saveContent: (id: number, content: string, wordCount: number): Promise<Chapter | null> =>
      ipcRenderer.invoke('chapters:saveContent', id, content, wordCount),
    reorder: (orderedIds: number[]): Promise<void> =>
      ipcRenderer.invoke('chapters:reorder', orderedIds),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('chapters:delete', id)
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
