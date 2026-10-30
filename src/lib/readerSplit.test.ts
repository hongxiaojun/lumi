import { describe, expect, it } from 'vitest'
import { clampSidebar, nextSidebar, PAGE_MIN, SIDEBAR_DEFAULT, SIDEBAR_MIN, sidebarAfterDrag } from './readerSplit'

describe('reader sidebar split', () => {
  it('keeps a full page when no sidebar is open', () => {
    expect(clampSidebar(1100, SIDEBAR_DEFAULT, 'none')).toBe(0)
  })

  it('gives the page the width the sidebar does not use', () => {
    expect(clampSidebar(1100, 320, 'left')).toBe(320)
    expect(1100 - clampSidebar(1100, 320, 'right')).toBe(780)
  })

  it('stops the sidebar before it covers the page or the menu', () => {
    expect(clampSidebar(1000, 900, 'left')).toBe(1000 - PAGE_MIN)
    expect(clampSidebar(600, 500, 'right')).toBe(600 - PAGE_MIN)
    expect(clampSidebar(400, 320, 'left')).toBe(400 - PAGE_MIN)
  })

  it('does not collapse the sidebar below its minimum when the window has room', () => {
    expect(clampSidebar(1100, 40, 'left')).toBe(SIDEBAR_MIN)
  })

  it('grows the left sidebar to the right and the right sidebar to the left', () => {
    expect(nextSidebar('left', 320, 40)).toBe(360)
    expect(nextSidebar('right', 320, 40)).toBe(280)
    expect(nextSidebar('right', 320, -24)).toBe(344)
  })

  it('ignores a drag that is not a number', () => {
    expect(nextSidebar('left', 320, Number.NaN)).toBe(320)
    expect(clampSidebar(0, 320, 'left')).toBe(0)
  })

  it('keeps a wider request when the drag cannot show a new width', () => {
    expect(sidebarAfterDrag(600, 'left', 280, 320, 40)).toBe(320)
    expect(sidebarAfterDrag(1100, 'left', SIDEBAR_MIN, SIDEBAR_MIN, -16)).toBe(SIDEBAR_MIN)
  })

  it('stores a drag that changes the sidebar and steps from the width on screen', () => {
    expect(sidebarAfterDrag(1100, 'left', 320, 320, 40)).toBe(360)
    expect(sidebarAfterDrag(1100, 'right', 320, 320, 40)).toBe(280)
    expect(sidebarAfterDrag(1100, 'left', SIDEBAR_MIN, 40, 16)).toBe(SIDEBAR_MIN + 16)
  })
})
