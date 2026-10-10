import { describe, expect, it } from 'vitest'
import { catalogFromBooks, uniqueSlug } from './build'

describe('uniqueSlug', () => {
  it('keeps the base slug when it is free', () => {
    expect(uniqueSlug('leaf', 'abcdef12zzzz', new Set())).toBe('leaf')
  })

  it('appends an id prefix when the slug is taken', () => {
    expect(uniqueSlug('leaf', 'abcdef12zzzz', new Set(['leaf']))).toBe('leaf-abcdef12')
  })
})

describe('catalogFromBooks', () => {
  it('prefers a stored aiSlug', () => {
    const rows = catalogFromBooks([
      { title: 'Leaf', author: 'A', aiSlug: 'leaf-custom', language: 'en' },
      { title: '叶读试读', author: 'B', language: 'zh' },
    ])
    expect(rows[0].slug).toBe('leaf-custom')
    expect(rows[1].slug).toBe('叶读试读')
  })
})
