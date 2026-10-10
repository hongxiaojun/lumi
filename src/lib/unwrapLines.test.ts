import { describe, expect, it } from 'vitest'
import { looksHardWrapped, typicalLineLength } from './unwrapLines'

describe('looksHardWrapped', () => {
  it('detects a Chinese EPUB that used one <p> per visual line', () => {
    const lengths = [
      22, 24, 21, 25, 23, 20, 19, 26, 22, 24, 18, 23, 21, 8, 22, 20, 24, 21, 7, 23,
    ]
    expect(looksHardWrapped(lengths, 'zh')).toBe(true)
  })

  it('does not treat a normally typeset chapter as wrapped', () => {
    const lengths = [86, 124, 98, 140, 12, 110, 95, 132, 8, 118, 101, 90]
    expect(looksHardWrapped(lengths, 'zh')).toBe(false)
  })

  it('does not unwrap a book whose paragraphs are long and similar', () => {
    const lengths = Array.from({ length: 12 }, () => 88)
    expect(looksHardWrapped(lengths, 'zh')).toBe(false)
  })

  it('needs enough lines to judge', () => {
    expect(looksHardWrapped([20, 21], 'zh')).toBe(false)
  })
})

describe('typicalLineLength', () => {
  it('returns the Calibre unwrap-factor percentile', () => {
    const lengths = [10, 20, 20, 20, 20, 21, 22, 40, 80]
    expect(typicalLineLength(lengths, 0.4)).toBeGreaterThanOrEqual(20)
    expect(typicalLineLength(lengths, 0.4)).toBeLessThanOrEqual(22)
  })
})
