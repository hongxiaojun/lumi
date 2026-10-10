import { describe, expect, it } from 'vitest'
import { clothFor, featuredBookId, plankRows, plankSize, spineLabel } from './shelfMotion'

describe('spineLabel', () => {
  it('keeps a short title', () => {
    expect(spineLabel('时间简史')).toBe('时间简史')
    expect(spineLabel('Dune')).toBe('Dune')
  })

  it('cuts at brackets, colon, or middot', () => {
    expect(spineLabel('时间简史（插图版）')).toBe('时间简史')
    expect(spineLabel('三体：黑暗森林')).toBe('三体')
    expect(spineLabel('罗伯特·奥本海默')).toBe('罗伯特')
    expect(spineLabel('Dune: The Duke')).toBe('Dune')
  })

  it('drops a leading bracketed tag and then cuts the rest', () => {
    expect(spineLabel('【译】时间简史（插图版）')).toBe('时间简史')
    expect(spineLabel('(Revised) Some Book: Extra')).toBe('Some Book')
  })

  it('breaks a long Latin title on a word, and slices one huge word', () => {
    expect(spineLabel('The Design of Everyday Things')).toBe('The Design of')
    expect(spineLabel('Manchester United F.C.')).toBe('Manchester')
    expect(spineLabel('Supercalifragilisticexpialidocious')).toBe('Supercalifragi')
  })

  it('caps a long Chinese title at 14 code points', () => {
    expect(spineLabel('这是一本名字特别特别长的中文书')).toBe('这是一本名字特别特别长的中文')
    expect([...spineLabel('这是一本名字特别特别长的中文书')].length).toBe(14)
  })

  it('uses 未命名 for blank titles', () => {
    expect(spineLabel('   ')).toBe('未命名')
    expect(spineLabel('')).toBe('未命名')
  })
})

describe('featuredBookId', () => {
  const books = [
    { id: 'a', lastOpenedAt: null },
    { id: 'b', lastOpenedAt: 20 },
    { id: 'c', lastOpenedAt: 10 },
  ]

  it('keeps a chosen book that is still on the shelf', () => {
    expect(featuredBookId(books, 'c')).toBe('c')
  })

  it('falls back to the latest opened book when the choice is gone', () => {
    expect(featuredBookId(books, 'missing')).toBe('b')
    expect(featuredBookId(books, null)).toBe('b')
  })

  it('uses the first book when nothing has been opened', () => {
    expect(featuredBookId([{ id: 'a', lastOpenedAt: null }, { id: 'd', lastOpenedAt: null }], null)).toBe('a')
  })

  it('returns null for an empty shelf', () => {
    expect(featuredBookId([], 'a')).toBeNull()
  })
})

describe('plankRows', () => {
  it('chunks books without dropping the tail', () => {
    expect(plankRows(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('returns one row when the count is not positive', () => {
    expect(plankRows(['a', 'b'], 0)).toEqual([['a', 'b']])
  })

  it('returns no rows for no books', () => {
    expect(plankRows([], 8)).toEqual([])
  })
})

describe('plankSize', () => {
  it('fits a phone, a tablet, and a wide desk', () => {
    expect(plankSize(390)).toBe(5)
    expect(plankSize(519)).toBe(5)
    expect(plankSize(520)).toBe(10)
    expect(plankSize(899)).toBe(10)
    expect(plankSize(900)).toBe(14)
    expect(plankSize(1600)).toBe(14)
  })

  it('treats a bad width as a phone shelf', () => {
    expect(plankSize(Number.NaN)).toBe(5)
    expect(plankSize(-20)).toBe(5)
  })
})

describe('clothFor', () => {
  it('stays on the same cloth for the same book', () => {
    expect(clothFor('book-1')).toEqual(clothFor('book-1'))
    expect(clothFor('book-1').cloth).toMatch(/^#[0-9a-f]{6}$/)
    expect(clothFor('book-1').ink).toMatch(/^#[0-9a-f]{6}$/)
  })
})
