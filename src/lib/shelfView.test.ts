import { describe, expect, it } from 'vitest'
import { readShelfView, SHELF_VIEW_KEY, shelfViewOf, writeShelfView, type ShelfView } from './shelfView'

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(SHELF_VIEW_KEY, initial)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('shelfViewOf', () => {
  it('keeps the standing shelf when nothing was chosen', () => {
    expect(shelfViewOf(null)).toBe('stand')
    expect(shelfViewOf(undefined)).toBe('stand')
    expect(shelfViewOf('')).toBe('stand')
  })

  it('accepts only the two shelf presentations', () => {
    expect(shelfViewOf('cover')).toBe('cover')
    expect(shelfViewOf('stand')).toBe('stand')
    expect(shelfViewOf('grid')).toBe('stand')
    expect(shelfViewOf(' cover')).toBe('stand')
  })
})

describe('shelf view storage', () => {
  it('round-trips the chosen presentation', () => {
    const store = memory()
    writeShelfView(store, 'cover')
    expect(readShelfView(store)).toBe('cover')
    writeShelfView(store, 'stand')
    expect(readShelfView(store)).toBe('stand')
    expect(store.getItem(SHELF_VIEW_KEY)).toBe('stand')
  })

  it('ignores a stored value that is not a shelf presentation', () => {
    expect(readShelfView(memory('weread'))).toBe('stand')
  })

  it('stays on the standing shelf when storage is missing or throws', () => {
    expect(readShelfView(null)).toBe('stand')
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readShelfView(broken)).toBe('stand')
    expect(() => writeShelfView(broken, 'cover' satisfies ShelfView)).not.toThrow()
    expect(() => writeShelfView(null, 'cover')).not.toThrow()
  })
})
