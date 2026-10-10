import { describe, expect, it } from 'vitest'
import {
  SEARCH_CAP,
  collectSearchYield,
  isBlankQuery,
  searchAcceptNode,
} from './searchHits'

describe('isBlankQuery', () => {
  it('treats empty and whitespace as blank', () => {
    expect(isBlankQuery('')).toBe(true)
    expect(isBlankQuery('   ')).toBe(true)
    expect(isBlankQuery('\n\t')).toBe(true)
  })

  it('keeps CJK and Latin queries', () => {
    expect(isBlankQuery('unit')).toBe(false)
    expect(isBlankQuery('安静')).toBe(false)
  })
})

describe('collectSearchYield', () => {
  it('appends chapter hits from a Foliate book-wide result', () => {
    const next = collectSearchYield([], {
      label: 'Chapter 1',
      subitems: [
        { cfi: '/6/4', excerpt: { pre: 'The ', match: 'unit', post: ' was never' } },
        { cfi: '/6/8', excerpt: { pre: '', match: 'unit', post: ' of work' } },
      ],
    })
    expect(next.done).toBe(false)
    expect(next.hits).toHaveLength(2)
    expect(next.hits[0]).toMatchObject({ cfi: '/6/4', label: 'Chapter 1', match: 'unit' })
  })

  it('records progress without adding hits', () => {
    const next = collectSearchYield([], { progress: 0.4 })
    expect(next.hits).toHaveLength(0)
    expect(next.progress).toBe(0.4)
    expect(next.done).toBe(false)
  })

  it('marks the iterator as done', () => {
    expect(collectSearchYield([], 'done').done).toBe(true)
  })

  it('skips malformed subitems without a CFI', () => {
    const next = collectSearchYield([], {
      label: 'X',
      subitems: [{ excerpt: { pre: '', match: 'a', post: '' } }],
    })
    expect(next.hits).toHaveLength(0)
  })

  it('stops accepting hits past the cap', () => {
    const filled = Array.from({ length: SEARCH_CAP }, (_, i) => ({
      cfi: `/x/${i}`,
      label: 'A',
      pre: '',
      match: 'u',
      post: '',
    }))
    const next = collectSearchYield(filled, {
      label: 'B',
      subitems: [{ cfi: '/y/1', excerpt: { pre: '', match: 'u', post: '' } }],
    })
    expect(next.hits).toHaveLength(SEARCH_CAP)
    expect(next.capped).toBe(true)
  })
})

describe('searchAcceptNode', () => {
  it('rejects translation nodes so对照 is not searched', () => {
    const tr = document.createElement('span')
    tr.setAttribute('data-leaf-tr', '1')
    expect(searchAcceptNode(tr)).toBe(NodeFilter.FILTER_REJECT)
  })

  it('rejects script and skips other elements', () => {
    expect(searchAcceptNode(document.createElement('script'))).toBe(NodeFilter.FILTER_REJECT)
    expect(searchAcceptNode(document.createElement('p'))).toBe(NodeFilter.FILTER_SKIP)
  })

  it('accepts text nodes', () => {
    expect(searchAcceptNode(document.createTextNode('unit'))).toBe(NodeFilter.FILTER_ACCEPT)
  })
})
