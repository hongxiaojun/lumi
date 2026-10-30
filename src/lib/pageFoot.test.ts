import { describe, expect, it } from 'vitest'
import { columnFoot, layoutFoot, paintPageFeet } from './pageFoot'

describe('columnFoot', () => {
  it('numbers each page of a spread and counts the pages left in the chapter', () => {
    const labels = columnFoot({
      columns: 2,
      at: 0,
      sectionPages: 19,
      before: 31,
      total: 548,
    })
    expect(labels).toEqual([
      { page: '32/548页', rest: '' },
      { page: '33/548页', rest: '本章还剩17页' },
    ])
  })

  it('puts the remainder on the only page when the spread is one column', () => {
    expect(columnFoot({
      columns: 1,
      at: 4,
      sectionPages: 10,
      before: 0,
      total: 10,
    })).toEqual([
      { page: '5/10页', rest: '本章还剩5页' },
    ])
  })

  it('leaves the blank side empty and drops the remainder on the last page', () => {
    expect(columnFoot({
      columns: 2,
      at: 4,
      sectionPages: 5,
      before: 0,
      total: 5,
    })).toEqual([
      { page: '5/5页', rest: '' },
      { page: '', rest: '' },
    ])
  })
})

describe('layoutFoot', () => {
  it('uses this chapter’s page size to number the open spread', () => {
    expect(layoutFoot({
      flow: 'paginated',
      columns: 2,
      page: 1,
      pages: 12,
      sectionSizes: [15_000],
      index: 0,
      locationCurrent: 0,
      locationTotal: 10,
      sectionFraction: 0,
    })).toEqual([
      { page: '1/20页', rest: '' },
      { page: '2/20页', rest: '本章还剩18页' },
    ])
  })

  it('counts earlier chapters with the same page size', () => {
    expect(layoutFoot({
      flow: 'paginated',
      columns: 2,
      page: 1,
      pages: 3,
      sectionSizes: [3_000, 1_500],
      index: 1,
      locationCurrent: 0,
      locationTotal: 4,
      sectionFraction: 0,
    })).toEqual([
      { page: '5/6页', rest: '' },
      { page: '6/6页', rest: '' },
    ])
  })

  it('says nothing until a real page is on screen', () => {
    expect(layoutFoot({
      flow: 'paginated',
      columns: 2,
      page: 0,
      pages: 12,
      sectionSizes: [15_000],
      index: 0,
      locationCurrent: 0,
      locationTotal: 10,
      sectionFraction: 0,
    })).toBeNull()
  })

  it('keeps one line while the book scrolls', () => {
    expect(layoutFoot({
      flow: 'scrolled',
      columns: 1,
      page: 0,
      pages: 0,
      sectionSizes: [6_000],
      index: 0,
      locationCurrent: 3,
      locationTotal: 40,
      sectionFraction: 0.5,
    })).toEqual([
      { page: '4/40页', rest: '本章还剩1页' },
    ])
  })
})

describe('paintPageFeet', () => {
  it('writes the page in the middle and the remainder on the right', () => {
    const foot = document.createElement('div')
    paintPageFeet([foot], [{ page: '33/548页', rest: '本章还剩17页' }])
    expect(foot.textContent).toBe('33/548页本章还剩17页')
    expect(foot.children[0]?.textContent).toBe('33/548页')
    expect(foot.children[1]?.textContent).toBe('本章还剩17页')
    expect((foot.children[1] as HTMLElement).style.position).toBe('absolute')
  })
})
