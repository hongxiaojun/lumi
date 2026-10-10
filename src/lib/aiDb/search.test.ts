import { describe, expect, it } from 'vitest'
import { searchChunks } from './search'
import type { AiChunk } from './types'

const chunks: AiChunk[] = [
  { id: 'c1', chapter: 1, heading: 'Unit', tag: 'p', text: 'The unit was never the job.' },
  { id: 'c2', chapter: 1, heading: 'Unit', tag: 'p', text: 'It was the people who stayed late.' },
  { id: 'c3', chapter: 2, heading: '方法', tag: 'p', text: '阅读软件并不缺。缺的是一个安静的地方。' },
]

describe('searchChunks', () => {
  it('returns English keyword hits with the heading attached', () => {
    const hits = searchChunks(chunks, 'never the job')
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('c1')
  })

  it('matches CJK substrings', () => {
    expect(searchChunks(chunks, '安静').map((h) => h.id)).toEqual(['c3'])
  })

  it('returns nothing for empty or unmatched queries', () => {
    expect(searchChunks(chunks, '')).toEqual([])
    expect(searchChunks(chunks, '   ')).toEqual([])
    expect(searchChunks(chunks, 'quantum pineapple')).toEqual([])
  })

  it('respects the hit limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `x${i}`,
      chapter: 1,
      tag: 'p',
      text: `The unit appears in paragraph ${i}.`,
    }))
    expect(searchChunks(many, 'unit', 3)).toHaveLength(3)
  })
})
