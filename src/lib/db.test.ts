import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBook } from '../types'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string, protocol = 'asset') => `${protocol}://localhost/${encodeURIComponent(path)}`,
}))

import { invoke } from '@tauri-apps/api/core'
import { BOOK_FETCH_CHUNK } from './ipcBytes'
import { DEFAULT_PREFS } from './styles'
import { userFontId, type UserFont } from './userFonts'
import {
  deleteBook,
  getBook,
  loadLocalBookLook,
  loadUserFonts,
  putBook,
  replaceLocalLookFonts,
  saveLocalBookLook,
  saveUserFonts,
} from './db'

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
    await putBook(makeBook({ title: '经济学的思维方式', author: '保罗·海恩', fileName: '经济学的思维方式.epub' }))
    expect(invokeMock).toHaveBeenCalledTimes(2)
    const [cmd, body, options] = invokeMock.mock.calls[0]
    expect(cmd).toBe('write_book_file')
    expect(body).toBeInstanceOf(Uint8Array)
    expect(Array.from(body as Uint8Array)).toEqual([1, 2, 3, 4])
    expect(options).toEqual({ headers: { 'x-book-id': 'book-1', 'x-book-ext': 'epub' } })
    const [metaCmd, metaBody, metaOptions] = invokeMock.mock.calls[1]
    expect(metaCmd).toBe('write_book_meta')
    const meta = JSON.parse(new TextDecoder().decode(metaBody as Uint8Array)) as Row
    expect(meta).toMatchObject({
      id: 'book-1',
      title: '经济学的思维方式',
      author: '保罗·海恩',
      fileName: '经济学的思维方式.epub',
    })
    expect(meta.fraction).toBeUndefined()
    expect(meta.cfi).toBeUndefined()
    expect(metaOptions).toEqual({ headers: { 'x-book-id': 'book-1' } })
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
    expect(invokeMock.mock.calls.map((call) => call[0])).toEqual(['write_book_meta'])
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

  it('Tauri: getBook reads the file through leafbook ranges', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub' }))
    invokeMock.mockClear()
    const fetchMock = vi.fn(async () => ({
      status: 206,
      headers: { get: () => 'bytes 0-2/3' },
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const got = await getBook('book-1')
    expect(fetchMock).toHaveBeenCalledWith('leafbook://localhost/book-1.epub', {
      headers: { Range: `bytes=0-${BOOK_FETCH_CHUNK - 1}` },
    })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(Array.from(new Uint8Array(await got!.file.arrayBuffer()))).toEqual([9, 8, 7])
    expect(got?.file).toBeInstanceOf(File)
    expect((got?.file as File).name).toBe('Story.EPUB')
    expect(got?.filePath).toBe('/books/book-1.epub')
  })

  it('Tauri: getBook falls back to read_book_file when leafbook fails', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub' }))
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 500, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) })))
    invokeMock.mockResolvedValueOnce([80, 75, 3, 4])
    const got = await getBook('book-1')
    expect(invokeMock).toHaveBeenCalledWith('read_book_file', {
      id: 'book-1',
      ext: 'epub',
      offset: 0,
      length: 128 * 1024,
    })
    expect(Array.from(new Uint8Array(await got!.file.arrayBuffer()))).toEqual([80, 75, 3, 4])
    expect(got?.file).toBeInstanceOf(File)
    expect((got?.file as File).name).toBe('Story.EPUB')
  })

  it('stores a new cover Blob and keeps it when a later write has none', async () => {
    setTauri(false)
    const cover = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    await putBook(makeBook({ cover }))
    const stored = idb.rows('books').get('book-1') as Row
    expect(stored.cover).toBeInstanceOf(Blob)
    expect(stored.cover).not.toBe(cover)
    expect(Array.from(new Uint8Array(await (stored.cover as Blob).arrayBuffer()))).toEqual([1, 2, 3])

    await putBook(makeBook({ cover: null, fraction: 0.2 }))
    const kept = idb.rows('books').get('book-1') as Row
    expect(Array.from(new Uint8Array(await (kept.cover as Blob).arrayBuffer()))).toEqual([1, 2, 3])

    await putBook(makeBook({ cover: new Blob([]), fraction: 0.4 }))
    const still = idb.rows('books').get('book-1') as Row
    expect(Array.from(new Uint8Array(await (still.cover as Blob).arrayBuffer()))).toEqual([1, 2, 3])
    expect(still.fraction).toBe(0.4)
  })

  it('Tauri: deleteBook removes file then metadata', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub' }))
    invokeMock.mockResolvedValueOnce(undefined)
    await deleteBook('book-1')
    expect(invokeMock).toHaveBeenCalledWith('delete_book_file', { id: 'book-1', ext: 'epub' })
    expect(idb.rows('books').has('book-1')).toBe(false)
  })

  it('keeps an added face on this Mac and changes only the font of saved looks', async () => {
    setTauri(false)
    expect(await loadUserFonts()).toEqual([])
    const face: UserFont = {
      id: 'abcd',
      name: '仓耳今楷',
      format: 'truetype',
      bytes: new Uint8Array([0, 1, 2, 255]),
      addedAt: 5,
    }
    await saveUserFonts([face])
    const loaded = await loadUserFonts()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.name).toBe('仓耳今楷')
    expect(loaded[0]?.bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(loaded[0]?.bytes ?? [])).toEqual([0, 1, 2, 255])

    await saveLocalBookLook('novel', {
      ...DEFAULT_PREFS,
      font: 'song',
      fontSize: 18,
      theme: 'night',
      focusRead: true,
    })
    await replaceLocalLookFonts(userFontId(face.id))
    const look = await loadLocalBookLook('novel')
    expect(look?.font).toBe('user:abcd')
    expect(look?.fontSize).toBe(18)
    expect(look?.theme).toBe('night')
    expect(look?.lineHeight).toBe(DEFAULT_PREFS.lineHeight)
    expect(look?.focusRead).toBe(true)
  })

  it('Tauri: deleteBook keeps metadata when delete_book_file fails', async () => {
    setTauri(true)
    await putBook(makeBook({ filePath: '/books/book-1.epub' }))
    invokeMock.mockRejectedValueOnce(new Error('busy'))
    await expect(deleteBook('book-1')).rejects.toThrow('busy')
    expect(idb.rows('books').has('book-1')).toBe(true)
  })
})
