import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBook } from '../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { deleteBook, getBook, putBook } from './db'

const invokeMock = vi.mocked(invoke)

type Row = Record<string, unknown>

// Minimal in-memory IndexedDB: enough for db.ts (keyPath stores, kv stores, one index per store).
function fakeIndexedDb() {
  const stores = new Map<string, { keyPath?: string; rows: Map<unknown, unknown>; indexes: Map<string, string> }>()
  // shallow copy (structuredClone drops jsdom Blobs)
  const copy = <T>(v: T): T =>
    Array.isArray(v) ? (v.map((x) => copy(x)) as T) : v && typeof v === 'object' && !(v instanceof Blob) ? { ...v } : v
  const request = <T>(run: () => T) => {
    const req = { result: undefined as T | undefined, error: null, onsuccess: null as null | (() => void), onerror: null }
    queueMicrotask(() => {
      req.result = copy(run())
      req.onsuccess?.()
    })
    return req
  }
  const storeApi = (name: string) => {
    const store = stores.get(name)!
    return {
      get: (key: unknown) => request(() => store.rows.get(key)),
      getAll: () => request(() => [...store.rows.values()]),
      put: (value: Row, key?: unknown) =>
        request(() => {
          const k = store.keyPath ? value[store.keyPath] : key
          store.rows.set(k, copy(value))
          return k
        }),
      delete: (key: unknown) => request(() => void store.rows.delete(key)),
      index: (indexName: string) => ({
        getAll: (value: unknown) =>
          request(() => [...store.rows.values()].filter((row) => (row as Row)[store.indexes.get(indexName)!] === value)),
      }),
      createIndex: (indexName: string, field: string) => void store.indexes.set(indexName, field),
    }
  }
  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string, options?: { keyPath?: string }) => {
      stores.set(name, { keyPath: options?.keyPath, rows: new Map(), indexes: new Map() })
      return storeApi(name)
    },
    transaction: () => ({ objectStore: storeApi }),
  }
  const factory = {
    open: () => {
      const req = {
        result: db,
        error: null,
        onupgradeneeded: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null,
      }
      queueMicrotask(() => {
        req.onupgradeneeded?.()
        req.onsuccess?.()
      })
      return req
    },
  }
  return { factory, rows: (name: string) => stores.get(name)?.rows ?? new Map() }
}

let idb: ReturnType<typeof fakeIndexedDb>

function makeBook(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id: 'book-1',
    title: 'T',
    author: 'A',
    fileName: 'Story.EPUB',
    file: new Blob([new Uint8Array([1, 2, 3, 4])]),
    cover: null,
    addedAt: 1,
    lastOpenedAt: null,
    cfi: null,
    fraction: 0,
    ...overrides,
  }
}

function setTauri(on: boolean) {
  const w = window as unknown as Record<string, unknown>
  if (on) w.__TAURI_INTERNALS__ = {}
  else delete w.__TAURI_INTERNALS__
}

beforeEach(() => {
  idb = fakeIndexedDb()
  vi.stubGlobal('indexedDB', idb.factory)
  invokeMock.mockReset()
})

afterEach(() => {
  setTauri(false)
  vi.unstubAllGlobals()
})

describe('db book storage (M10-2)', () => {
  it('non-Tauri: putBook/getBook/deleteBook keep the Blob in IndexedDB and never call invoke', async () => {
    setTauri(false)
    await putBook(makeBook())
    const stored = idb.rows('books').get('book-1') as Row
    expect(stored.file).toBeInstanceOf(Blob)
    expect(stored.filePath).toBeUndefined()
    const got = await getBook('book-1')
    expect(got?.file).toBeInstanceOf(Blob)
    await deleteBook('book-1')
    expect(idb.rows('books').has('book-1')).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('Tauri: putBook writes raw bytes with x-book-id/x-book-ext headers and stores filePath without file Blob', async () => {
    setTauri(true)
    invokeMock.mockResolvedValueOnce('/books/book-1.epub')
    await putBook(makeBook())
    expect(invokeMock).toHaveBeenCalledTimes(1)
    const [cmd, body, options] = invokeMock.mock.calls[0]
    expect(cmd).toBe('write_book_file')
    expect(body).toBeInstanceOf(Uint8Array)
    expect(Array.from(body as Uint8Array)).toEqual([1, 2, 3, 4])
    expect(options).toEqual({ headers: { 'x-book-id': 'book-1', 'x-book-ext': 'epub' } })
    const stored = idb.rows('books').get('book-1') as Row
    expect(stored.filePath).toBe('/books/book-1.epub')
    expect('file' in stored).toBe(false)
  })

  it('Tauri: putBook stores no metadata when write_book_file fails', async () => {
    setTauri(true)
    invokeMock.mockRejectedValueOnce(new Error('disk full'))
    await expect(putBook(makeBook())).rejects.toThrow('disk full')
    expect(idb.rows('books').has('book-1')).toBe(false)
  })

  it('Tauri: putBook with existing filePath does not rewrite the file', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub', fraction: 0.5 }))
    expect(invokeMock).not.toHaveBeenCalled()
    const stored = idb.rows('books').get('book-1') as Row
    expect(stored.fraction).toBe(0.5)
    expect('file' in stored).toBe(false)
  })

  it('Tauri: putBook without filePath keeps disk path when store already has filePath (never rewrite Blob)', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub', fraction: 0.1 }))
    invokeMock.mockReset()
    // Caller dropped filePath (e.g. progress tick from a book object that only kept the Blob) —
    // must NOT treat as legacy and must NOT write Blob back into IDB.
    await putBook(makeBook({ fraction: 0.7 }))
    expect(invokeMock).not.toHaveBeenCalled()
    const stored = idb.rows('books').get('book-1') as Row
    expect(stored.filePath).toBe('/books/book-1.epub')
    expect('file' in stored).toBe(false)
    expect(stored.fraction).toBe(0.7)
  })

  it('Tauri: putBook leaves legacy Blob rows untouched (migration is M10-3)', async () => {
    setTauri(false)
    await putBook(makeBook())
    setTauri(true)
    await putBook(makeBook({ fraction: 0.3 }))
    expect(invokeMock).not.toHaveBeenCalled()
    const stored = idb.rows('books').get('book-1') as Row
    expect(stored.file).toBeInstanceOf(Blob)
    expect(stored.filePath).toBeUndefined()
    expect(stored.fraction).toBe(0.3)
  })

  it('Tauri: getBook reads bytes via read_book_file', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub' }))
    invokeMock.mockResolvedValueOnce(new Uint8Array([9, 8, 7]).buffer)
    const got = await getBook('book-1')
    expect(invokeMock).toHaveBeenCalledWith('read_book_file', { id: 'book-1', ext: 'epub' })
    expect(Array.from(new Uint8Array(await got!.file.arrayBuffer()))).toEqual([9, 8, 7])
    expect(got?.filePath).toBe('/books/book-1.epub')
  })

  it('Tauri: deleteBook removes file then metadata', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub' }))
    invokeMock.mockResolvedValueOnce(undefined)
    await deleteBook('book-1')
    expect(invokeMock).toHaveBeenCalledWith('delete_book_file', { id: 'book-1', ext: 'epub' })
    expect(idb.rows('books').has('book-1')).toBe(false)
  })

  it('Tauri: deleteBook keeps metadata when delete_book_file fails', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub' }))
    invokeMock.mockRejectedValueOnce(new Error('busy'))
    await expect(deleteBook('book-1')).rejects.toThrow('busy')
    expect(idb.rows('books').has('book-1')).toBe(true)
  })
})
