import { describe, expect, it } from 'vitest'
import {
  SHELF_INDEX,
  SHELF_SECTION_KEY,
  booksInSection,
  droppedRecord,
  emptyIndexCopy,
  readShelfSection,
  sectionCounts,
  shelfMark,
  shelfMarkPhrase,
  shelfSectionOf,
  writeShelfSection,
  type ShelfSection,
} from './shelfIndex'

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(SHELF_SECTION_KEY, initial)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

const shelf = [
  { id: 'unread', title: '还没翻开', fraction: 0, lastOpenedAt: 50 },
  { id: 'peek', title: '打开过但没翻页', fraction: 0, lastOpenedAt: 80 },
  { id: 'mid', title: '金线', fraction: 0.42, lastOpenedAt: 10 },
  { id: 'later', title: '认知突围', fraction: 0.7, lastOpenedAt: 30 },
  { id: 'done', title: '已经读完的书', fraction: 0.98, lastOpenedAt: 20 },
  { id: 'full', title: '全书末尾', fraction: 1, lastOpenedAt: 5 },
]

describe('shelfSectionOf', () => {
  it('starts on the whole shelf', () => {
    expect(shelfSectionOf(null)).toBe('library')
    expect(shelfSectionOf(undefined)).toBe('library')
    expect(shelfSectionOf('')).toBe('library')
    expect(shelfSectionOf('want')).toBe('library')
    expect(shelfSectionOf(' library')).toBe('library')
  })

  it('accepts the shelf sections and the audiobook column', () => {
    expect(shelfSectionOf('library')).toBe('library')
    expect(shelfSectionOf('reading')).toBe('reading')
    expect(shelfSectionOf('finished')).toBe('finished')
    expect(shelfSectionOf('audiobook')).toBe('audiobook')
  })
})

describe('booksInSection', () => {
  it('keeps the whole shelf in its original order', () => {
    const books = shelf.map((book) => ({ ...book }))
    expect(booksInSection(books, 'library').map((book) => book.id)).toEqual(books.map((book) => book.id))
    expect(books.map((book) => book.id)).toEqual(['unread', 'peek', 'mid', 'later', 'done', 'full'])
  })

  it('lists books with a turned page, newest first, and leaves finished books out', () => {
    expect(booksInSection(shelf, 'reading').map((book) => book.id)).toEqual(['later', 'mid'])
  })

  it('does not treat an opened book at the first page as currently reading', () => {
    expect(booksInSection(shelf, 'reading').map((book) => book.id)).not.toContain('peek')
  })

  it('uses the same finished line as the cover badge', () => {
    expect(booksInSection([{ id: 'edge', fraction: 0.98, lastOpenedAt: 1 }], 'finished')).toHaveLength(1)
    expect(booksInSection([{ id: 'edge', fraction: 0.979, lastOpenedAt: 1 }], 'reading')).toHaveLength(1)
    expect(booksInSection([{ id: 'edge', fraction: 0.979, lastOpenedAt: 1 }], 'finished')).toHaveLength(0)
  })

  it('treats a full book, a clamped overflow, and a blank fraction as not currently reading', () => {
    const books = [
      { id: 'over', fraction: 1.4, lastOpenedAt: 3 },
      { id: 'blank', fraction: Number.NaN, lastOpenedAt: 4 },
      { id: 'neg', fraction: -0.2, lastOpenedAt: 2 },
      { id: 'gone', fraction: null, lastOpenedAt: 1 },
    ]
    expect(booksInSection(books, 'reading')).toEqual([])
    expect(booksInSection(books, 'finished').map((book) => book.id)).toEqual(['over'])
  })

  it('sorts finished books by the last open and keeps a tie in shelf order', () => {
    const books = [
      { id: 'a', title: '甲', fraction: 1, lastOpenedAt: 8 },
      { id: 'b', title: '乙', fraction: 0.99, lastOpenedAt: 8 },
      { id: 'c', title: '丙', fraction: 1, lastOpenedAt: Number.NaN },
    ]
    expect(booksInSection(books, 'finished').map((book) => book.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps a Chinese title on the shelf it belongs to', () => {
    const books = [{ id: 'zh', title: '《认知突围》', fraction: 0.2, lastOpenedAt: 1 }]
    expect(booksInSection(books, 'reading')[0]?.title).toBe('《认知突围》')
  })

  it('returns an empty list when the shelf is empty', () => {
    expect(booksInSection([], 'reading')).toEqual([])
    expect(booksInSection([], 'library')).toEqual([])
  })
})

describe('sectionCounts', () => {
  it('counts each book once', () => {
    expect(sectionCounts(shelf)).toEqual({ library: 6, reading: 2, finished: 2, audiobook: 0 })
    expect(sectionCounts([])).toEqual({ library: 0, reading: 0, finished: 0, audiobook: 0 })
    expect(sectionCounts(shelf, ['done', 'gone', 'done'])).toEqual({
      library: 6,
      reading: 2,
      finished: 2,
      audiobook: 1,
    })
  })
})

describe('shelf index copy', () => {
  it('names the sections in shelf order, with audiobooks after finished books', () => {
    expect(SHELF_INDEX.map((item) => item.label)).toEqual(['我的藏书', '正在读', '已读完', '有声书'])
    expect(SHELF_INDEX.map((item) => item.id)).toEqual(['library', 'reading', 'finished', 'audiobook'])
  })

  it('explains an empty reading or finished section and stays quiet for the whole shelf', () => {
    expect(emptyIndexCopy('reading')).toBe('还没有正在读的书')
    expect(emptyIndexCopy('finished')).toBe('还没有读完的书')
    expect(emptyIndexCopy('library')).toBeNull()
    expect(emptyIndexCopy('audiobook')).toBe('还没有加入有声书的书')
  })

  it('shows an audiobook only after its id is added, and a finished book stays out until then', () => {
    expect(booksInSection(shelf, 'audiobook').map((book) => book.id)).toEqual([])
    expect(booksInSection(shelf, 'audiobook', ['full', 'missing', 'mid']).map((book) => book.id)).toEqual([
      'full',
      'mid',
    ])
  })
})

describe('shelf mark', () => {
  it('deletes the book only from the whole library', () => {
    expect(shelfMark('library')).toBe('delete')
    expect(shelfMarkPhrase('library')).toBe('删除书籍')
  })

  it('drops the reading record from the current and finished shelves', () => {
    expect(shelfMark('reading')).toBe('drop')
    expect(shelfMark('finished')).toBe('drop')
    expect(shelfMarkPhrase('reading')).toBe('移出正在读')
    expect(shelfMarkPhrase('finished')).toBe('移出已读完')
  })

  it('leaves the audiobook column without deleting the book or clearing its place', () => {
    expect(shelfMark('audiobook')).toBe('leave')
    expect(shelfMarkPhrase('audiobook')).toBe('移出有声书')
  })

  it('keeps the book on the whole shelf and clears the place that put it on a filtered shelf', () => {
    const reading = { id: 'mid', title: '金线', fraction: 0.42, cfi: 'epubcfi(/6)', lastOpenedAt: 10 }
    const finished = { id: 'done', title: '《认知突围》', fraction: 1, cfi: 'epubcfi(/8)', lastOpenedAt: 20 }
    const droppedReading = droppedRecord(reading)
    const droppedFinished = droppedRecord(finished)
    expect(reading.fraction).toBe(0.42)
    expect(droppedReading).toMatchObject({ id: 'mid', title: '金线', fraction: 0, cfi: null, lastOpenedAt: 10 })
    expect(droppedFinished).toMatchObject({ id: 'done', title: '《认知突围》', fraction: 0, cfi: null, lastOpenedAt: 20 })
    const shelf = [droppedReading, droppedFinished]
    expect(booksInSection(shelf, 'library').map((book) => book.id)).toEqual(['mid', 'done'])
    expect(booksInSection(shelf, 'reading')).toEqual([])
    expect(booksInSection(shelf, 'finished')).toEqual([])
  })

  it('clears a blank or overflowing place without inventing a new position', () => {
    expect(droppedRecord({ id: 'blank', fraction: Number.NaN, cfi: 'epubcfi(/2)', lastOpenedAt: null })).toMatchObject({
      fraction: 0,
      cfi: null,
      lastOpenedAt: null,
    })
    expect(droppedRecord({ id: 'over', fraction: 1.4, cfi: null, lastOpenedAt: 3 }).fraction).toBe(0)
  })
})

describe('shelf section storage', () => {
  it('round-trips the chosen section', () => {
    const store = memory()
    writeShelfSection(store, 'reading')
    expect(readShelfSection(store)).toBe('reading')
    writeShelfSection(store, 'finished')
    expect(readShelfSection(store)).toBe('finished')
    writeShelfSection(store, 'audiobook')
    expect(readShelfSection(store)).toBe('audiobook')
    expect(store.getItem(SHELF_SECTION_KEY)).toBe('audiobook')
  })

  it('returns to the whole shelf when the stored value is not a section', () => {
    expect(readShelfSection(memory('audiobooks'))).toBe('library')
  })

  it('stays on the whole shelf when storage is missing or throws', () => {
    expect(readShelfSection(null)).toBe('library')
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readShelfSection(broken)).toBe('library')
    expect(() => writeShelfSection(broken, 'reading' satisfies ShelfSection)).not.toThrow()
    expect(() => writeShelfSection(null, 'reading')).not.toThrow()
  })
})
