import { describe, expect, it } from 'vitest'
import {
  bookIsParsing,
  openAllowed,
  parseCaption,
  parsePercent,
  sectionFraction,
  upsertBook,
} from './parseGate'
import type { LibraryBook } from '../types'

function book(id: string, title = id): LibraryBook {
  return {
    id,
    title,
    author: 'A',
    fileName: `${id}.epub`,
    file: new Blob(),
    cover: null,
    addedAt: 1,
    lastOpenedAt: null,
    cfi: null,
    fraction: 0,
  }
}

describe('parse gate', () => {
  it('blocks opening while a book is still under 100%', () => {
    const gates = { a: 0.4, b: 0.99 }
    expect(bookIsParsing(gates, 'a')).toBe(true)
    expect(openAllowed(gates, 'a')).toBe(false)
    expect(openAllowed(gates, 'b')).toBe(false)
    expect(openAllowed(gates, 'c')).toBe(true)
    expect(openAllowed(undefined, 'a')).toBe(true)
  })

  it('allows opening once the gate is gone', () => {
    expect(bookIsParsing({}, 'a')).toBe(false)
    expect(openAllowed({ a: 1 }, 'a')).toBe(true)
  })

  it('labels the bar in Chinese percent and clamps wild values', () => {
    expect(parsePercent(0.4)).toBe(40)
    expect(parsePercent(1.4)).toBe(100)
    expect(parsePercent(Number.NaN)).toBe(0)
    expect(parseCaption(0.42)).toBe('正在解析 42%')
  })

  it('spends 40% on metadata and the rest on sections, stopping at 99 until the save finishes', () => {
    expect(sectionFraction(0, 4)).toBeCloseTo(0.4)
    expect(sectionFraction(2, 4)).toBeCloseTo(0.4 + 0.59 * 0.5)
    expect(sectionFraction(4, 4)).toBeCloseTo(0.99)
    expect(sectionFraction(0, 0)).toBeCloseTo(0.4)
    expect(sectionFraction(-1, 4)).toBeCloseTo(0.4)
  })

  it('puts the parsing book on the shelf without dropping the others', () => {
    const rows = upsertBook([book('old')], book('new', '新书'))
    expect(rows.map((row) => row.id)).toEqual(['new', 'old'])
    const again = upsertBook(rows, book('new', '新书二'))
    expect(again.map((row) => row.title)).toEqual(['新书二', 'old'])
  })
})
