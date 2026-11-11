import { describe, expect, it } from 'vitest'
import { snapBoost } from 'foliate-js/paginator.js'
import { GESTURE_SLOP, pageSeam, touchFollows } from './pageCurl'

describe('pageSeam', () => {
  it('moves the next page edge from the right and the previous from the left', () => {
    expect(pageSeam(0, 390)).toEqual({ seam: 0.5, shade: 0 })
    expect(pageSeam(195, 390)).toEqual({ seam: 0.5, shade: 1 })
    expect(pageSeam(390, 390)).toEqual({ seam: 0, shade: 1 })
    expect(pageSeam(-195, 390)).toEqual({ seam: 0.5, shade: 1 })
    expect(pageSeam(-390, 390)).toEqual({ seam: 1, shade: 1 })
  })

  it('keeps the shade off when there is no page or no movement', () => {
    expect(pageSeam(10, 0)).toEqual({ seam: 0.5, shade: 0 })
    expect(pageSeam(Number.NaN, 390).shade).toBe(0)
    expect(pageSeam(0, Number.POSITIVE_INFINITY).shade).toBe(0)
  })
})

describe('touchFollows', () => {
  it('lets a scrolled book follow the finger and a page book swipe', () => {
    expect(touchFollows('scrolled', 0)).toBe('scroll')
    expect(touchFollows('paginated', 8)).toBe('tap')
    expect(touchFollows('paginated', GESTURE_SLOP - 1, 4)).toBe('tap')
    expect(touchFollows('paginated', 40, 4)).toBe('swipe')
    expect(touchFollows('paginated', 6, 40)).toBe('scroll')
  })
})

describe('snapBoost', () => {
  const size = 400

  it('turns after a short drag or a flick, and springs back before that', () => {
    expect(snapBoost(size * 0.28, 0, size, false)).toBe(size / 2 + 1)
    expect(snapBoost(size * 0.2, 0, size, false)).toBe(0)
    expect(snapBoost(10, 0.35, size, false)).toBe(size / 2 + 1)
    expect(snapBoost(10, 0.2, size, false)).toBe(0)
    expect(snapBoost(-size * 0.28, 0, size, false)).toBe(-(size / 2 + 1))
    expect(snapBoost(0, -0.35, size, false)).toBe(-(size / 2 + 1))
  })

  it('flips only the flick direction for a right-to-left book', () => {
    expect(snapBoost(0, 0.35, size, true)).toBe(-(size / 2 + 1))
    expect(snapBoost(size * 0.28, 0, size, true)).toBe(size / 2 + 1)
  })

  it('stays put when the page size is missing', () => {
    expect(snapBoost(40, 1, 0, false)).toBe(0)
    expect(snapBoost(Number.NaN, Number.NaN, size, false)).toBe(0)
  })
})
