import { describe, expect, it } from 'vitest'
import { bookSlug, chapterFileName } from './slug'

describe('bookSlug', () => {
  it('slugifies an English title', () => {
    expect(bookSlug('The Unit Was Never the Job')).toBe('the-unit-was-never-the-job')
  })

  it('keeps a Chinese title readable', () => {
    expect(bookSlug('叶读试读')).toBe('叶读试读')
  })

  it('strips path characters and collapsing dashes', () => {
    expect(bookSlug('A/B testing: why?')).toBe('a-b-testing-why')
  })

  it('returns untitled for empty or punctuation-only names', () => {
    expect(bookSlug('')).toBe('untitled')
    expect(bookSlug('   ')).toBe('untitled')
    expect(bookSlug('///')).toBe('untitled')
  })

  it('caps length at 80 characters', () => {
    expect(bookSlug('a'.repeat(120)).length).toBeLessThanOrEqual(80)
  })
})

describe('chapterFileName', () => {
  it('pads the index and slugs the heading', () => {
    expect(chapterFileName(0, 'Why make a reader')).toBe('01-why-make-a-reader.md')
    expect(chapterFileName(11, '附录')).toBe('12-附录.md')
  })
})
