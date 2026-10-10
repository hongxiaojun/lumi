import { describe, expect, it } from 'vitest'
import { capBlocks, nextLinearIndexes } from './prefetch'

const doc = { createDocument: async () => new Document() }

describe('nextLinearIndexes', () => {
  it('skips non-linear sections and returns the next readable ones', () => {
    const sections = [
      doc,
      { linear: 'no', ...doc },
      doc,
      doc,
    ]
    expect(nextLinearIndexes(sections, 0, 1)).toEqual([2])
    expect(nextLinearIndexes(sections, 0, 2)).toEqual([2, 3])
  })

  it('returns nothing at the end of the book', () => {
    expect(nextLinearIndexes([doc, doc], 1, 2)).toEqual([])
  })

  it('ignores sections without createDocument', () => {
    expect(nextLinearIndexes([{}, {}], 0, 1)).toEqual([])
  })
})

describe('capBlocks', () => {
  it('keeps short chapters intact', () => {
    expect(capBlocks(['a', 'b'], 80)).toEqual(['a', 'b'])
  })

  it('cuts a long chapter so prefetch cannot dump the whole book', () => {
    const many = Array.from({ length: 120 }, (_, i) => i)
    expect(capBlocks(many, 80)).toHaveLength(80)
  })
})
