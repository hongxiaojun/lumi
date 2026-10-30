import { describe, expect, it } from 'vitest'
import { keepShownBook } from './keepShownBook'

describe('keepShownBook', () => {
  const shown = { id: 'book-a', file: new Blob(['a']) }
  const loaded = { id: 'book-a', file: new Blob(['b']) }

  it('keeps the book already on screen so a second read does not restart it', () => {
    expect(keepShownBook(shown, 'book-a', loaded)).toBe(shown)
  })

  it('uses the disk book when nothing is on screen', () => {
    expect(keepShownBook(null, 'book-a', loaded)).toBe(loaded)
  })

  it('uses the disk book when the screen is showing another book', () => {
    expect(keepShownBook(shown, 'book-b', loaded)).toBe(loaded)
  })

  it('clears the screen when the disk read is empty and the ids differ', () => {
    expect(keepShownBook(shown, 'book-b', null)).toBeNull()
  })
})
