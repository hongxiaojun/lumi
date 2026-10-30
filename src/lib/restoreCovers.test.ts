import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBook } from '../types'

const getBook = vi.fn()
const putBook = vi.fn()
const makeBook = vi.fn()
const destroy = vi.fn()

vi.mock('./db', () => ({
  getBook: (...args: unknown[]) => getBook(...args),
  putBook: (...args: unknown[]) => putBook(...args),
}))

vi.mock('foliate-js/view.js', () => ({
  makeBook: (...args: unknown[]) => makeBook(...args),
}))

import { restoreMissingCovers } from './restoreCovers'

function book(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id: 'book-1',
    title: 'T',
    author: 'A',
    fileName: 't.epub',
    file: new Blob([new Uint8Array([1])]),
    cover: null,
    addedAt: 1,
    lastOpenedAt: null,
    cfi: null,
    fraction: 0,
    filePath: '/books/book-1.epub',
    ...overrides,
  }
}

beforeEach(() => {
  getBook.mockReset()
  putBook.mockReset()
  makeBook.mockReset()
  destroy.mockReset()
})

describe('restoreMissingCovers', () => {
  it('skips a book that already has a cover', async () => {
    restoreMissingCovers([book({ id: 'has-cover', cover: new Blob([new Uint8Array([1])]) })], () => {})
    await Promise.resolve()
    expect(makeBook).not.toHaveBeenCalled()
    expect(getBook).not.toHaveBeenCalled()
  })

  it('writes a cover once and does not ask for the same book again', async () => {
    const file = new Blob([new Uint8Array([9])])
    const cover = new Blob([new Uint8Array([4, 5])], { type: 'image/jpeg' })
    getBook.mockResolvedValue(book({ id: 'miss-cover', file, cover: null }))
    makeBook.mockResolvedValue({ getCover: async () => cover, destroy })
    let updates = 0
    restoreMissingCovers([book({ id: 'miss-cover', file: undefined, cover: null })], () => {
      updates += 1
    })
    await vi.waitFor(() => expect(updates).toBe(1))
    expect(putBook).toHaveBeenCalledTimes(1)
    expect(putBook.mock.calls[0]?.[0].cover).toBe(cover)
    expect(destroy).toHaveBeenCalledTimes(1)

    restoreMissingCovers([book({ id: 'miss-cover', cover: null })], () => {
      updates += 1
    })
    await Promise.resolve()
    expect(makeBook).toHaveBeenCalledTimes(1)
    expect(updates).toBe(1)
  })
})
