import { describe, expect, it } from 'vitest'
import { shelfRows } from './shelfQuery'

function book(title: string, author = '', fileName = `${title}.epub`, fraction: number | null = null, lastOpenedAt = 0) {
  return { id: title, title, author, fileName, fraction, lastOpenedAt }
}

const shelf = [
  book('活着', '余华', 'huozhe.epub', 0.42, 20),
  book('许三观卖血记', '余华', 'xusanguan.epub', 1, 10),
  book('The Little Prince', 'Saint-Exupéry', 'prince.epub', 0.1, 30),
]

describe('shelfRows', () => {
  it('keeps the section when the query is empty', () => {
    const rows = shelfRows(shelf, 'library', '')
    expect(rows.searching).toBe(false)
    expect(rows.title).toBe('我的藏书')
    expect(rows.books.map((row) => row.title)).toEqual(['活着', '许三观卖血记', 'The Little Prince'])
  })

  it('treats a whitespace query as empty', () => {
    const rows = shelfRows(shelf, 'reading', '   ')
    expect(rows.searching).toBe(false)
    expect(rows.title).toBe('正在读')
    expect(rows.books.map((row) => row.title)).toEqual(['The Little Prince', '活着'])
  })

  it('searches every book, not just the open section', () => {
    const rows = shelfRows(shelf, 'reading', '余华')
    expect(rows.searching).toBe(true)
    expect(rows.title).toBe('搜索结果')
    expect(rows.books.map((row) => row.title)).toEqual(['活着', '许三观卖血记'])
  })

  it('matches the file name and ignores case', () => {
    expect(shelfRows(shelf, 'library', 'PRINCE').books.map((row) => row.title)).toEqual(['The Little Prince'])
    expect(shelfRows(shelf, 'library', 'xusanguan').books.map((row) => row.title)).toEqual(['许三观卖血记'])
  })

  it('returns no rows when nothing matches', () => {
    const rows = shelfRows(shelf, 'library', '不存在的书')
    expect(rows.searching).toBe(true)
    expect(rows.books).toEqual([])
  })

  it('orders the reading section by the last open', () => {
    const rows = shelfRows(shelf, 'reading', '')
    expect(rows.books.map((row) => row.title)).toEqual(['The Little Prince', '活着'])
  })
})
