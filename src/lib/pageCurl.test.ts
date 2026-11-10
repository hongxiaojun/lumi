import { describe, expect, it } from 'vitest'
import { curlDrag, touchFollows } from './pageCurl'

describe('curlDrag', () => {
  it('stays a tap until the finger has crossed the page', () => {
    expect(curlDrag(100, 110, 390)).toEqual({ side: 'stay', progress: 0 })
    expect(curlDrag(100, 70, 390).side).toBe('right')
    expect(curlDrag(200, 240, 390).side).toBe('left')
  })

  it('fills the curl when the finger reaches the other edge', () => {
    expect(curlDrag(0, 390, 390).progress).toBe(1)
    expect(curlDrag(10, 0, 0)).toEqual({ side: 'stay', progress: 0 })
  })
})

describe('touchFollows', () => {
  it('lets a scrolled book follow the finger and a page book curl', () => {
    expect(touchFollows('scrolled', 0)).toBe('scroll')
    expect(touchFollows('paginated', 8)).toBe('tap')
    expect(touchFollows('paginated', 40)).toBe('curl')
  })
})
