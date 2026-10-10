import { describe, expect, it } from 'vitest'
import { createAnnotation, isNoteColor, mergeAnnotation, NOTE_COLORS, notesForBook } from './notes'

describe('NOTE_COLORS', () => {
  it('offers the usual highlighter pens', () => {
    expect(NOTE_COLORS.map((c) => c.id)).toEqual([
      'yellow',
      'orange',
      'green',
      'blue',
      'purple',
      'pink',
    ])
  })

  it('accepts only known pen ids', () => {
    expect(isNoteColor('orange')).toBe(true)
    expect(isNoteColor('black')).toBe(false)
  })
})

describe('createAnnotation', () => {
  it('stores trimmed selected text', () => {
    const a = createAnnotation({
      bookId: 'b1',
      cfi: '/6/4',
      text: '  Hello   world  ',
      now: 1,
    })
    expect(a.text).toBe('Hello world')
    expect(a.color).toBe('yellow')
    expect(a.note).toBe('')
  })

  it('keeps the chosen pen color', () => {
    const a = createAnnotation({
      bookId: 'b1',
      cfi: '/6/4',
      text: 'Hello',
      color: 'purple',
      now: 2,
    })
    expect(a.color).toBe('purple')
  })

  it('rejects empty selection', () => {
    expect(() => createAnnotation({ bookId: 'b1', cfi: '/6/4', text: '   ' })).toThrow(/选中/)
  })

  it('rejects missing cfi', () => {
    expect(() => createAnnotation({ bookId: 'b1', cfi: '', text: 'Hi' })).toThrow(/定位/)
  })
})

describe('notesForBook', () => {
  it('filters and sorts newest first', () => {
    const a = createAnnotation({ bookId: 'a', cfi: '1', text: 'one', now: 1 })
    const b = createAnnotation({ bookId: 'b', cfi: '2', text: 'two', now: 2 })
    const c = createAnnotation({ bookId: 'a', cfi: '3', text: 'three', now: 3 })
    expect(notesForBook([a, b, c], 'a').map((n) => n.text)).toEqual(['three', 'one'])
  })
})

describe('mergeAnnotation', () => {
  it('updates color in place when the same sentence is highlighted again', () => {
    const first = createAnnotation({ bookId: 'a', cfi: 'epubcfi(/6/4!/4/2:0)', text: 'Hello', color: 'yellow', now: 1 })
    const second = createAnnotation({ bookId: 'a', cfi: 'epubcfi(/6/4!/4/2:0)', text: 'Hello', color: 'blue', now: 2 })
    const merged = mergeAnnotation([first], second)
    expect(merged).toHaveLength(1)
    expect(merged[0].color).toBe('blue')
  })
})
