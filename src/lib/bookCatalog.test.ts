import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBook } from '../types'
import { bookFromCatalog, diskMetaOf, shouldWriteDiskMeta } from './bookCatalog'

function makeBook(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id: 'book-1',
    title: '经济学的思维方式',
    author: '保罗·海恩',
    fileName: '经济学的思维方式.epub',
    file: new Blob([new Uint8Array([1])]),
    cover: new Blob([new Uint8Array([9])]),
    addedAt: 1760000000000,
    lastOpenedAt: 1760000001000,
    cfi: 'epubcfi(/6/4!/4)',
    fraction: 0.265,
    language: 'zh',
    aiSlug: 'economics',
    aiBuiltAt: 1760000002000,
    ...overrides,
  }
}

describe('disk book catalog', () => {
  it('keeps the shelf identity and leaves progress, cover, and the file off the sidecar', () => {
    expect(diskMetaOf(makeBook())).toEqual({
      id: 'book-1',
      title: '经济学的思维方式',
      author: '保罗·海恩',
      fileName: '经济学的思维方式.epub',
      addedAt: 1760000000000,
      language: 'zh',
      aiSlug: 'economics',
      aiBuiltAt: 1760000002000,
    })
  })

  it('fills a blank title or author so the shelf card is not empty', () => {
    expect(diskMetaOf(makeBook({ title: '  ', author: '' }))).toMatchObject({
      title: '未命名',
      author: '未知作者',
    })
  })

  it('writes a sidecar when the book first lands on disk or its identity changes', () => {
    const onDisk = makeBook({ filePath: '/books/book-1.epub' })
    expect(shouldWriteDiskMeta(undefined, onDisk)).toBe(true)
    expect(shouldWriteDiskMeta(onDisk, { ...onDisk, fraction: 0.9, cfi: 'next' })).toBe(false)
    expect(shouldWriteDiskMeta(onDisk, { ...onDisk, title: '新书名' })).toBe(true)
    expect(shouldWriteDiskMeta(onDisk, { ...onDisk, aiSlug: 'other' })).toBe(true)
  })

  it('does not write a sidecar for a legacy blob that is still only in IndexedDB', () => {
    const legacy = makeBook()
    expect(legacy.filePath).toBeUndefined()
    expect(shouldWriteDiskMeta(legacy, { ...legacy, fraction: 0.4 })).toBe(false)
    expect(shouldWriteDiskMeta(undefined, legacy)).toBe(false)
  })

  it('rebuilds a shelf row from a sidecar without bringing back progress', () => {
    const book = bookFromCatalog({
      id: 'book-1',
      filePath: '/books/book-1.epub',
      meta: diskMetaOf(makeBook()),
    })
    expect(book?.fraction).toBe(0)
    expect(book?.lastOpenedAt).toBeNull()
    expect(book?.cfi).toBeNull()
    expect(book?.cover).toBeNull()
    expect(book?.filePath).toBe('/books/book-1.epub')
    expect(book?.file.size).toBe(0)
    expect(book?.title).toBe('经济学的思维方式')
    expect(book?.language).toBe('zh')
  })

  it('drops a sidecar that cannot be opened as a book', () => {
    const meta = diskMetaOf(makeBook())
    expect(bookFromCatalog({ id: 'other', filePath: '/books/other.epub', meta })).toBeNull()
    expect(bookFromCatalog({ id: 'book-1', filePath: '', meta })).toBeNull()
    expect(bookFromCatalog({
      id: 'book-1',
      filePath: '/books/book-1.txt',
      meta: { ...meta, fileName: 'notes.txt' },
    })).toBeNull()
    expect(bookFromCatalog({
      id: 'book-1',
      filePath: '/books/book-1.epub',
      meta: { ...meta, addedAt: -1 },
    })).toBeNull()
    expect(bookFromCatalog({
      id: '../x',
      filePath: '/tmp/x.epub',
      meta: { ...meta, id: '../x', fileName: 'x.epub' },
    })).toBeNull()
  })
})

describe('restoreDiskCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('puts a disk book back on the shelf and does not reset a book that is already there', async () => {
    vi.resetModules()
    const putBook = vi.fn(async () => {})
    const existing = makeBook({ filePath: '/books/book-1.epub', fraction: 0.265 })
    vi.doMock('./db', () => ({
      listBooks: vi.fn(async () => [existing]),
      putBook,
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(async (cmd: string) => {
        if (cmd === 'write_book_meta') return null
        if (cmd === 'list_book_catalog') {
          return [
            { id: 'book-1', filePath: '/books/book-1.epub', meta: diskMetaOf(existing) },
            {
              id: 'book-2',
              filePath: '/books/book-2.mobi',
              meta: {
                id: 'book-2',
                title: '金线',
                author: '未知作者',
                fileName: '金线.mobi',
                addedAt: 10,
              },
            },
            {
              id: 'bad',
              filePath: '/books/bad.txt',
              meta: { id: 'bad', title: 'x', author: 'y', fileName: 'x.txt', addedAt: 1 },
            },
          ]
        }
        throw new Error(cmd)
      }),
    }))
    const w = window as unknown as Record<string, unknown>
    w.__TAURI_INTERNALS__ = {}
    const { restoreDiskCatalog } = await import('./bookCatalog')
    const added = await restoreDiskCatalog()
    expect(added).toBe(1)
    expect(putBook).toHaveBeenCalledTimes(1)
    const restored = putBook.mock.calls[0][0] as LibraryBook
    expect(restored.id).toBe('book-2')
    expect(restored.fraction).toBe(0)
    expect(restored.filePath).toBe('/books/book-2.mobi')
    expect(restored.title).toBe('金线')
    delete w.__TAURI_INTERNALS__
  })

  it('does nothing outside the desktop app', async () => {
    vi.resetModules()
    const invoke = vi.fn()
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }))
    vi.doMock('./db', () => ({ listBooks: vi.fn(), putBook: vi.fn() }))
    const w = window as unknown as Record<string, unknown>
    delete w.__TAURI_INTERNALS__
    const { restoreDiskCatalog } = await import('./bookCatalog')
    expect(await restoreDiskCatalog()).toBe(0)
    expect(invoke).not.toHaveBeenCalled()
  })
})
