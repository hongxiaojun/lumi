import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBook } from '../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { listBooks, migrateLegacyBooks, putBook } from './db'

const invokeMock = vi.mocked(invoke)

type Row = Record<string, unknown>

function fakeIndexedDb() {
  const stores = new Map<string, { keyPath?: string; rows: Map<unknown, unknown>; indexes: Map<string, string> }>()
  const copy = <T>(v: T): T =>
    Array.isArray(v)
      ? (v.map((x) => copy(x)) as T)
      : v && typeof v === 'object' && !(v instanceof Blob)
        ? { ...v }
        : v
  const request = <T>(run: () => T) => {
    const req = {
      result: undefined as T | undefined,
      error: null,
      onsuccess: null as null | (() => void),
      onerror: null,
    }
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
          request(() =>
            [...store.rows.values()].filter((row) => (row as Row)[store.indexes.get(indexName)!] === value),
          ),
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
  return {
    factory: {
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
    },
    rows: (name: string) => stores.get(name)?.rows ?? new Map(),
  }
}

let idb: ReturnType<typeof fakeIndexedDb>

function makeBook(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id: 'book-1',
    title: 'One',
    author: 'A',
    fileName: 'one.epub',
    file: new Blob([new Uint8Array([1, 2, 3, 4])]),
    cover: new Blob([new Uint8Array([9])]),
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

function decodeBody(body: unknown): string {
  if (typeof body === 'string') return body
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body as ArrayBufferView)
  return String(body)
}

beforeEach(() => {
  idb = fakeIndexedDb()
  vi.stubGlobal('indexedDB', idb.factory)
  invokeMock.mockReset()
  setTauri(false)
})

afterEach(() => {
  setTauri(false)
  vi.unstubAllGlobals()
})

describe('migrateLegacyBooks (M10-3)', () => {
  it('non-Tauri: never calls invoke', async () => {
    setTauri(false)
    await putBook(makeBook())
    await migrateLegacyBooks()
    expect(invokeMock).not.toHaveBeenCalled()
    expect((idb.rows('books').get('book-1') as Row).file).toBeInstanceOf(Blob)
  })

  it('all succeed: backup then write/read/verify and strip file Blob', async () => {
    setTauri(false)
    await putBook(makeBook({ id: 'ok-1', title: 'Good', fileName: 'good.epub' }))
    await putBook(
      makeBook({
        id: 'ok-2',
        title: 'Also',
        fileName: 'also.epub',
        file: new Blob([new Uint8Array([5, 6])]),
      }),
    )
    setTauri(true)

    invokeMock.mockImplementation(async (cmd: string, arg?: unknown, opts?: { headers?: Record<string, string> }) => {
      if (cmd === 'backup_book_file') return `/tmp/backup/${opts!.headers!['x-book-id']}.epub`
      if (cmd === 'write_migration_text') return undefined
      if (cmd === 'write_book_file') return `/books/${opts!.headers!['x-book-id']}.epub`
      if (cmd === 'read_book_file') {
        const id = (arg as { id: string }).id
        const bytes = id === 'ok-1' ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array([5, 6])
        return bytes.buffer
      }
      throw new Error(`unexpected ${cmd}`)
    })

    await migrateLegacyBooks()

    const cmds = invokeMock.mock.calls.map((c) => c[0])
    expect(cmds.filter((c) => c === 'backup_book_file')).toHaveLength(2)
    expect(cmds).toContain('write_migration_text')
    expect(cmds.filter((c) => c === 'write_book_file')).toHaveLength(2)
    expect(cmds.filter((c) => c === 'read_book_file')).toHaveLength(2)

    for (const id of ['ok-1', 'ok-2']) {
      const stored = idb.rows('books').get(id) as Row
      expect(stored.filePath).toMatch(/^\/books\//)
      expect('file' in stored).toBe(false)
    }

    const booksJsonCall = invokeMock.mock.calls.find(
      (c) => c[0] === 'write_migration_text' && (c[2] as { headers: Record<string, string> }).headers['x-file-name'] === 'books.json',
    )
    expect(booksJsonCall).toBeTruthy()
    const json = JSON.parse(decodeBody(booksJsonCall![1]))
    expect(json[0].file).toBeUndefined()
    expect(json[0].cover).toBeUndefined()
  })

  it('backup failure: zero migration, books keep Blob', async () => {
    setTauri(false)
    await putBook(makeBook({ id: 'keep-1' }))
    setTauri(true)
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'backup_book_file') throw new Error('disk full')
      if (cmd === 'write_migration_text') return undefined
      throw new Error(`unexpected ${cmd}`)
    })
    await migrateLegacyBooks()
    expect(invokeMock.mock.calls.some((c) => c[0] === 'write_book_file')).toBe(false)
    const stored = idb.rows('books').get('keep-1') as Row
    expect(stored.file).toBeInstanceOf(Blob)
    expect(stored.filePath).toBeUndefined()
    const logCall = invokeMock.mock.calls.find(
      (c) => c[0] === 'write_migration_text' && (c[2] as { headers: Record<string, string> }).headers['x-file-name'] === 'migration.log',
    )
    expect(decodeBody(logCall![1])).toMatch(/BACKUP_FAILED.*disk full/)
  })

  it('one book size mismatch: only that book keeps Blob; migration.log records it', async () => {
    setTauri(false)
    await putBook(makeBook({ id: 'ok-1', title: 'Good', fileName: 'good.epub' }))
    await putBook(
      makeBook({
        id: 'bad-1',
        title: 'Bad',
        fileName: 'bad.epub',
        file: new Blob([new Uint8Array([7, 8, 9])]),
      }),
    )
    setTauri(true)

    invokeMock.mockImplementation(async (cmd: string, arg?: unknown, opts?: { headers?: Record<string, string> }) => {
      if (cmd === 'backup_book_file') return `/backup/${opts!.headers!['x-book-id']}.epub`
      if (cmd === 'write_migration_text') return undefined
      if (cmd === 'write_book_file') return `/books/${opts!.headers!['x-book-id']}.epub`
      if (cmd === 'read_book_file') {
        const id = (arg as { id: string }).id
        // ok-1 matches 4 bytes; bad-1 returns wrong length
        if (id === 'ok-1') return new Uint8Array([1, 2, 3, 4]).buffer
        return new Uint8Array([7, 8]).buffer
      }
      throw new Error(`unexpected ${cmd}`)
    })

    await migrateLegacyBooks()

    const ok = idb.rows('books').get('ok-1') as Row
    expect(ok.filePath).toBe('/books/ok-1.epub')
    expect('file' in ok).toBe(false)

    const bad = idb.rows('books').get('bad-1') as Row
    expect(bad.file).toBeInstanceOf(Blob)
    expect(bad.filePath).toBeUndefined()

    const logCall = invokeMock.mock.calls.find(
      (c) => c[0] === 'write_migration_text' && (c[2] as { headers: Record<string, string> }).headers['x-file-name'] === 'migration.log',
    )
    expect(decodeBody(logCall![1])).toMatch(/bad-1 Bad size mismatch/)
  })

  it('concurrent calls share one in-flight run: write_book_file once per book', async () => {
    setTauri(false)
    await putBook(makeBook({ id: 'ok-1', title: 'Good', fileName: 'good.epub' }))
    await putBook(
      makeBook({
        id: 'ok-2',
        title: 'Also',
        fileName: 'also.epub',
        file: new Blob([new Uint8Array([5, 6])]),
      }),
    )
    setTauri(true)

    let backupDirs = new Set<string>()
    invokeMock.mockImplementation(async (cmd: string, arg?: unknown, opts?: { headers?: Record<string, string> }) => {
      // Yield so both callers can enter before the first finishes.
      await Promise.resolve()
      if (cmd === 'backup_book_file') {
        backupDirs.add(opts!.headers!['x-backup-dir'])
        return `/backup/${opts!.headers!['x-book-id']}.epub`
      }
      if (cmd === 'write_migration_text') return undefined
      if (cmd === 'write_book_file') return `/books/${opts!.headers!['x-book-id']}.epub`
      if (cmd === 'read_book_file') {
        const id = (arg as { id: string }).id
        return (id === 'ok-1' ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array([5, 6])).buffer
      }
      throw new Error(`unexpected ${cmd}`)
    })

    await Promise.all([migrateLegacyBooks(), migrateLegacyBooks()])

    const writes = invokeMock.mock.calls.filter((c) => c[0] === 'write_book_file')
    expect(writes).toHaveLength(2)
    const writeIds = writes.map((c) => (c[2] as { headers: Record<string, string> }).headers['x-book-id']).sort()
    expect(writeIds).toEqual(['ok-1', 'ok-2'])
    expect(backupDirs.size).toBe(1)
    expect(invokeMock.mock.calls.filter((c) => c[0] === 'backup_book_file')).toHaveLength(2)
  })

  it('second run is idempotent: already filePath books skip invoke', async () => {
    setTauri(true)
    // Seed as already migrated (direct IDB via non-Tauri put then manually patch — use putBook with filePath)
    await putBook(makeBook({ id: 'done-1', filePath: '/books/done-1.epub' }))
    invokeMock.mockClear()
    await migrateLegacyBooks()
    expect(invokeMock).not.toHaveBeenCalled()
    const listed = await listBooks()
    expect(listed).toHaveLength(1)
  })
})
