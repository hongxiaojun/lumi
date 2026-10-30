import { describe, expect, it } from 'vitest'
import { visibleSize } from 'foliate-js/paginator.js'

describe('page column inside the window', () => {
  it('keeps the column size when the column sits inside the window', () => {
    expect(visibleSize(
      { width: 640, height: 800, left: 40, top: 20 },
      { left: 0, top: 0, right: 900, bottom: 1000 },
    )).toEqual({ width: 640, height: 800 })
  })

  it('cuts the column back to the window when the window edge moves in', () => {
    expect(visibleSize(
      { width: 1100, height: 800, left: 80, top: 10 },
      { left: 0, top: 0, right: 900, bottom: 700 },
    )).toEqual({ width: 820, height: 690 })
  })

  it('gives nothing when the column is already outside the window', () => {
    expect(visibleSize(
      { width: 400, height: 200, left: 1000, top: 0 },
      { left: 0, top: 0, right: 900, bottom: 800 },
    )).toEqual({ width: 0, height: 200 })
  })
})
