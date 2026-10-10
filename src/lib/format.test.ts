import { describe, expect, it } from 'vitest'
import { clampFraction, openedPhrase, percentLabel, shelfMarks, sliderSteps } from './format'

describe('clampFraction', () => {
  it('keeps values in 0–1', () => {
    expect(clampFraction(0)).toBe(0)
    expect(clampFraction(1)).toBe(1)
    expect(clampFraction(0.42)).toBe(0.42)
  })

  it('clamps out-of-range numbers', () => {
    expect(clampFraction(-0.2)).toBe(0)
    expect(clampFraction(1.4)).toBe(1)
  })

  it('treats empty and non-finite values as 0', () => {
    expect(clampFraction(undefined)).toBe(0)
    expect(clampFraction(null)).toBe(0)
    expect(clampFraction(Number.NaN)).toBe(0)
    expect(clampFraction(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('percentLabel', () => {
  it('shows one decimal for whole-book progress', () => {
    expect(percentLabel(0)).toBe('0%')
    expect(percentLabel(1)).toBe('100%')
    expect(percentLabel(0.123)).toBe('12.3%')
    expect(percentLabel(0.5)).toBe('50%')
  })

  it('does not exceed 100% or go below 0%', () => {
    expect(percentLabel(2)).toBe('100%')
    expect(percentLabel(-1)).toBe('0%')
    expect(percentLabel(Number.NaN)).toBe('0%')
  })
})

const now = new Date(2026, 8, 27, 15, 0, 0).getTime()

describe('openedPhrase', () => {
  it('says when the book was last opened', () => {
    expect(openedPhrase(null, now)).toBe('还没打开')
    expect(openedPhrase(now - 20_000, now)).toBe('刚刚')
    expect(openedPhrase(now - 5 * 60_000, now)).toBe('5 分钟前')
    expect(openedPhrase(now - 3 * 60 * 60_000, now)).toBe('3 小时前')
    expect(openedPhrase(new Date(2026, 8, 26, 9, 0, 0).getTime(), now)).toBe('昨天')
    expect(openedPhrase(new Date(2026, 8, 24, 9, 0, 0).getTime(), now)).toBe('3 天前')
    expect(openedPhrase(new Date(2026, 8, 1, 9, 0, 0).getTime(), now)).toBe('9月1日')
  })
})

describe('shelfMarks', () => {
  it('marks a recent unopened book as newly imported', () => {
    expect(shelfMarks({ addedAt: now - 2 * 60 * 60_000, lastOpenedAt: null, fraction: 0 }, now)).toEqual({
      badge: '新导入',
      opened: '还没打开',
      progress: '还没开始',
    })
  })

  it('shows progress after the book has been opened', () => {
    expect(
      shelfMarks({ addedAt: now - 2 * 60 * 60_000, lastOpenedAt: now - 5 * 60_000, fraction: 0.123 }, now),
    ).toEqual({
      badge: null,
      opened: '5 分钟前',
      progress: '12.3%',
    })
  })

  it('calls a nearly finished book already read', () => {
    expect(shelfMarks({ addedAt: now - 40 * 24 * 60 * 60_000, lastOpenedAt: now - 60 * 60_000, fraction: 0.99 }, now)).toEqual({
      badge: '已读完',
      opened: '1 小时前',
      progress: '已经读完',
    })
  })

  it('does not keep the new badge after a week or after opening', () => {
    expect(shelfMarks({ addedAt: now - 8 * 24 * 60 * 60_000, lastOpenedAt: null, fraction: 0 }, now).badge).toBeNull()
    expect(shelfMarks({ addedAt: now - 60_000, lastOpenedAt: now, fraction: 0 }, now).badge).toBeNull()
  })
})

describe('sliderSteps', () => {
  it('maps a fraction onto the range input scale', () => {
    expect(sliderSteps(0)).toBe(0)
    expect(sliderSteps(1)).toBe(1000)
    expect(sliderSteps(0.123)).toBe(123)
  })

  it('clamps before rounding', () => {
    expect(sliderSteps(2)).toBe(1000)
    expect(sliderSteps(undefined)).toBe(0)
  })
})
