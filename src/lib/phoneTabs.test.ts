import { describe, expect, it } from 'vitest'
import {
  briefBooks,
  continueBooks,
  matchesQuery,
  phoneSectionOf,
  phoneTabOf,
  PHONE_TAB_KEY,
  readPhoneTab,
  writePhoneTab,
} from './phoneTabs'

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(PHONE_TAB_KEY, initial)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('phoneTabOf', () => {
  it('opens on the home tab', () => {
    expect(phoneTabOf(null)).toBe('home')
    expect(phoneTabOf('')).toBe('home')
    expect(phoneTabOf('library')).toBe('home')
  })

  it('accepts only the four phone tabs', () => {
    expect(phoneTabOf('books')).toBe('books')
    expect(phoneTabOf('search')).toBe('search')
    expect(phoneTabOf('brief')).toBe('brief')
    expect(phoneTabOf(' 摘要')).toBe('home')
  })
})

describe('phoneSectionOf', () => {
  it('keeps the whole shelf unless the reader asks for one list', () => {
    expect(phoneSectionOf(null)).toBe('all')
    expect(phoneSectionOf('library')).toBe('all')
    expect(phoneSectionOf('reading')).toBe('reading')
    expect(phoneSectionOf('finished')).toBe('finished')
  })
})

describe('phone tab storage', () => {
  it('round-trips the chosen tab', () => {
    const store = memory()
    writePhoneTab(store, 'brief')
    expect(readPhoneTab(store)).toBe('brief')
    expect(store.getItem(PHONE_TAB_KEY)).toBe('brief')
  })

  it('stays on home when storage is missing', () => {
    expect(readPhoneTab(null)).toBe('home')
    expect(readPhoneTab(memory('nope'))).toBe('home')
  })
})

describe('matchesQuery', () => {
  const book = { title: '认知突围', author: '蔡垒磊', fileName: 'think.epub' }

  it('keeps every book when the query is blank', () => {
    expect(matchesQuery(book, '  ')).toBe(true)
  })

  it('matches title, author, or file name without case', () => {
    expect(matchesQuery(book, '突围')).toBe(true)
    expect(matchesQuery(book, '蔡垒')).toBe(true)
    expect(matchesQuery(book, 'THINK')).toBe(true)
    expect(matchesQuery(book, '小说')).toBe(false)
  })
})

describe('continueBooks', () => {
  it('keeps opened books newest first and skips a book that was never opened', () => {
    const books = [
      { id: 'old', lastOpenedAt: 10 },
      { id: 'new', lastOpenedAt: 30 },
      { id: 'none', lastOpenedAt: null },
    ]
    expect(continueBooks(books).map((book) => book.id)).toEqual(['new', 'old'])
  })
})

describe('briefBooks', () => {
  it('keeps only books whose text has been indexed', () => {
    const books = [
      { id: 'dark', aiBuiltAt: null },
      { id: 'lit', aiBuiltAt: 20 },
      { id: 'older', aiBuiltAt: 5 },
    ]
    expect(briefBooks(books).map((book) => book.id)).toEqual(['lit', 'older'])
  })
})
