import { describe, expect, it } from 'vitest'
import { pageSeam, touchFollows } from './pageCurl'

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
    expect(touchFollows('paginated', 40)).toBe('swipe')
  })
})
