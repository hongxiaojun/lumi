import { describe, expect, it } from 'vitest'
import {
  bookmarksForBook,
  createBookmark,
  isCurrentBookmark,
  toggleBookmark,
} from './bookmarks'

describe('createBookmark', () => {
  it('requires a CFI', () => {
    expect(() => createBookmark({ bookId: 'b1', cfi: '', label: 'Ch 1' })).toThrow(/定位/)
  })

  it('falls back to a generic label', () => {
    const mark = createBookmark({ bookId: 'b1', cfi: '/6/4', label: '  ', now: 1 })
    expect(mark.label).toBe('书签')
    expect(mark.id).toBe('m1')
  })

  it('keeps a chapter title', () => {
    const mark = createBookmark({ bookId: 'b1', cfi: '/6/4', label: '  第三章  ', now: 2 })
    expect(mark.label).toBe('第三章')
  })
})

describe('toggleBookmark', () => {
  it('adds a pin at a new location', () => {
    const mark = createBookmark({ bookId: 'b1', cfi: '/6/4', label: 'A', now: 1 })
    const { list, added } = toggleBookmark([], mark)
    expect(added).toBe(true)
    expect(list).toHaveLength(1)
  })

  it('removes the pin when the same CFI is toggled again', () => {
    const mark = createBookmark({ bookId: 'b1', cfi: '/6/4', label: 'A', now: 1 })
    const once = toggleBookmark([], mark).list
    const { list, added } = toggleBookmark(once, mark)
    expect(added).toBe(false)
    expect(list).toHaveLength(0)
  })

  it('does not remove a pin from another book', () => {
    const a = createBookmark({ bookId: 'b1', cfi: '/6/4', label: 'A', now: 1 })
    const b = createBookmark({ bookId: 'b2', cfi: '/6/4', label: 'B', now: 2 })
    const { list } = toggleBookmark([a], b)
    expect(list.map((row) => row.bookId)).toEqual(['b2', 'b1'])
  })
})

describe('bookmarksForBook', () => {
  it('returns newest first for one book', () => {
    const a = createBookmark({ bookId: 'b1', cfi: '/1', label: 'A', now: 1 })
    const b = createBookmark({ bookId: 'b1', cfi: '/2', label: 'B', now: 2 })
    const other = createBookmark({ bookId: 'b2', cfi: '/1', label: 'X', now: 3 })
    expect(bookmarksForBook([other, a, b], 'b1').map((row) => row.label)).toEqual(['B', 'A'])
  })
})

describe('isCurrentBookmark', () => {
  it('matches the open location', () => {
    const mark = createBookmark({ bookId: 'b1', cfi: '/6/4', label: 'A', now: 1 })
    expect(isCurrentBookmark([mark], 'b1', '/6/4')).toBe(true)
    expect(isCurrentBookmark([mark], 'b1', '/6/8')).toBe(false)
    expect(isCurrentBookmark([mark], 'b1', null)).toBe(false)
  })
})
