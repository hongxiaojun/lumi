import { describe, expect, it } from 'vitest'
import {
  estimateSpeechSeconds,
  nextSegmentIndex,
  previousSegmentIndex,
  segmentStart,
  skipBySeconds,
} from './transport'

const units = [
  { blockIndex: 0, text: '甲' },
  { blockIndex: 0, text: '乙' },
  { blockIndex: 1, text: '丙' },
  { blockIndex: 1, text: '丁' },
  { blockIndex: 2, text: '戊' },
]

describe('segment jumps', () => {
  it('treats one block as one segment, even when the block has several sentences', () => {
    expect(segmentStart(units, 1)).toBe(0)
    expect(segmentStart(units, 3)).toBe(2)
    expect(nextSegmentIndex(units, 1)).toBe(2)
    expect(nextSegmentIndex(units, 3)).toBe(4)
    expect(previousSegmentIndex(units, 3)).toBe(0)
    expect(previousSegmentIndex(units, 4)).toBe(2)
  })

  it('restarts the first segment and reports no segment after the last', () => {
    expect(previousSegmentIndex(units, 1)).toBe(0)
    expect(nextSegmentIndex(units, 4)).toBe(units.length)
    expect(nextSegmentIndex([], 0)).toBe(0)
  })
})

describe('five-second skip', () => {
  it('estimates Chinese faster speech as a shorter clip', () => {
    const text = '中'.repeat(42)
    expect(estimateSpeechSeconds(text, 1)).toBeCloseTo(10, 5)
    expect(estimateSpeechSeconds(text, 2)).toBeCloseTo(5, 5)
    expect(estimateSpeechSeconds('', Number.NaN)).toBe(0.4)
  })

  it('lands inside a later sentence when five seconds crosses clip boundaries', () => {
    expect(skipBySeconds([2, 2, 8], 0, 0, 5)).toEqual({ index: 2, offset: 1, pastEnd: false })
    expect(skipBySeconds([2, 2, 8], 2, 1, -5)).toEqual({ index: 0, offset: 0, pastEnd: false })
  })

  it('stays inside the current clip when five seconds fits, and stops at the ends', () => {
    expect(skipBySeconds([12], 0, 3, 5)).toEqual({ index: 0, offset: 8, pastEnd: false })
    expect(skipBySeconds([12], 0, 1, -5)).toEqual({ index: 0, offset: 0, pastEnd: false })
    expect(skipBySeconds([3], 0, 1, 5)).toEqual({ index: 0, offset: 3, pastEnd: true })
    expect(skipBySeconds([], 0, 0, 5)).toEqual({ index: 0, offset: 0, pastEnd: true })
  })
})
