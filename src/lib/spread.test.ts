import { describe, expect, it } from 'vitest'
import { SPREAD_PAGE_PX, spreadColumns } from './spread'

describe('spreadColumns', () => {
  it('stays one page until the stage is wider than tall and holds two pages', () => {
    expect(spreadColumns(1200, 800, 'paginated')).toBe(1)
    expect(spreadColumns(SPREAD_PAGE_PX * 2 - 1, 800, 'paginated')).toBe(1)
    expect(spreadColumns(1600, 1700, 'paginated')).toBe(1)
    expect(spreadColumns(1440, 1440, 'paginated')).toBe(1)
    expect(spreadColumns(SPREAD_PAGE_PX * 2, 800, 'paginated')).toBe(2)
    expect(spreadColumns(1800, 1000, 'paginated')).toBe(2)
  })

  it('keeps one page while scrolling, and when the size is missing', () => {
    expect(spreadColumns(1800, 1000, 'scrolled')).toBe(1)
    expect(spreadColumns(0, 800, 'paginated')).toBe(1)
    expect(spreadColumns(1800, Number.NaN, 'paginated')).toBe(1)
    expect(spreadColumns(-1, 800, 'paginated')).toBe(1)
  })
})
