import { describe, expect, it } from 'vitest'
import { bindMarginTap, pointOf, tapClaims, tapPlace } from './pageTap'

function box(el: HTMLElement, x: number, y: number, width: number, height: number) {
  el.getBoundingClientRect = () => new DOMRect(x, y, width, height)
}

function stage(
  pageBox: [number, number, number, number],
  clipBox: [number, number, number, number],
  frameBox: [number, number, number, number],
) {
  const page = document.createElement('div')
  const port = document.createElement('div')
  port.style.overflow = 'hidden'
  const frame = document.createElement('iframe')
  port.append(frame)
  page.append(port)
  document.body.append(page)
  box(page, ...pageBox)
  box(port, ...clipBox)
  box(frame, ...frameBox)
  return { page, frame }
}

describe('tapPlace', () => {
  it('turns on the blank side of a wide page and keeps a click on the text as the page', () => {
    const { page, frame } = stage([0, 0, 1200, 800], [260, 36, 680, 700], [260, 36, 680, 700])
    expect(tapPlace(100, frame, page)).toBe('left')
    expect(tapPlace(260, frame, page)).toBe('text')
    expect(tapPlace(270, frame, page)).toBe('text')
    expect(tapPlace(600, frame, page)).toBe('text')
    expect(tapPlace(940, frame, page)).toBe('text')
    expect(tapPlace(941, frame, page)).toBe('right')
    page.remove()
  })

  it('gives a narrow screen a thumb-width edge without taking the middle of the line', () => {
    const { page, frame } = stage([0, 0, 390, 800], [16, 20, 358, 740], [16, 20, 358, 740])
    expect(tapPlace(10, frame, page)).toBe('left')
    expect(tapPlace(47.9, frame, page)).toBe('left')
    expect(tapPlace(48, frame, page)).toBe('text')
    expect(tapPlace(200, frame, page)).toBe('text')
    expect(tapPlace(342, frame, page)).toBe('text')
    expect(tapPlace(342.1, frame, page)).toBe('right')
    expect(tapPlace(380, frame, page)).toBe('right')
    page.remove()
  })

  it('turns a narrow page from the bottom corners and keeps the upper page as the menu', () => {
    const { page, frame } = stage([0, 0, 390, 800], [16, 20, 358, 740], [16, 20, 358, 740])
    expect(tapPlace(40, frame, page, 700)).toBe('left')
    expect(tapPlace(350, frame, page, 720)).toBe('right')
    expect(tapPlace(40, frame, page, 780)).toBe('left')
    expect(tapPlace(200, frame, page, 720)).toBe('text')
    expect(tapPlace(30, frame, page, 200)).toBe('text')
    expect(tapPlace(360, frame, page, 80)).toBe('text')
    page.remove()
  })

  it('reads the visible page when the chapter iframe is many pages wide', () => {
    const { page, frame } = stage([0, 0, 800, 600], [0, 10, 800, 580], [-2400, 10, 4800, 580])
    // A click in the iframe reports coordinates local to that iframe.
    const left = frame.getBoundingClientRect().left
    expect(tapPlace(left + 2800, frame, page)).toBe('text')
    expect(tapPlace(left + 2420, frame, page)).toBe('left')
    expect(tapPlace(left + 3180, frame, page)).toBe('right')
    page.remove()
  })

  it('opens the tools when the page size is missing', () => {
    const frame = document.createElement('iframe')
    const page = document.createElement('div')
    document.body.append(page, frame)
    box(page, 0, 0, 0, 0)
    box(frame, 0, 0, 0, 0)
    expect(tapPlace(10, frame, page)).toBe('text')
    expect(tapPlace(Number.NaN, frame, page)).toBe('text')
    page.remove()
    frame.remove()
  })

  it('lets a link keep the click', () => {
    const link = document.createElement('a')
    link.href = '#next'
    const word = document.createElement('span')
    word.textContent = '下一章'
    link.append(word)
    const paragraph = document.createElement('p')
    paragraph.textContent = '正文'
    expect(tapClaims(word)).toBe(true)
    expect(tapClaims(link)).toBe(true)
    expect(tapClaims(paragraph)).toBe(false)
    expect(tapClaims(null)).toBe(false)
  })
})

describe('pointOf', () => {
  it('reads a finger from the touch, not from a mouse coordinate of zero', () => {
    const ev = new Event('touchend')
    Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: 180, clientY: 400 }] })
    Object.defineProperty(ev, 'touches', { value: [] })
    Object.setPrototypeOf(ev, TouchEvent.prototype)
    expect(pointOf(ev)).toEqual({ x: 180, y: 400 })
    expect(pointOf(new MouseEvent('mouseup', { clientX: 12, clientY: 8 }))).toEqual({ x: 12, y: 8 })
  })
})

describe('bindMarginTap', () => {
  it('turns on the blank side, opens tools on the page, and ignores a drag and a link', () => {
    const { page, frame } = stage([0, 0, 1200, 800], [260, 36, 680, 700], [260, 36, 680, 700])
    const link = document.createElement('a')
    link.href = '#next'
    page.append(link)
    const seen: string[] = []
    const stop = bindMarginTap(page, {
      frame: () => frame,
      turn: (side) => seen.push(side),
      chrome: () => seen.push('chrome'),
    })
    gesture(page, 100, 200)
    gesture(page, 600, 200)
    gesture(page, 100, 200, 130, 200)
    gesture(link, 100, 200)
    finger(page, 1100, 200)
    stop()
    gesture(page, 1100, 200)
    expect(seen).toEqual(['left', 'chrome', 'right'])
    page.remove()
  })

  it('does nothing before a chapter frame exists', () => {
    const page = document.createElement('div')
    document.body.append(page)
    const seen: string[] = []
    const stop = bindMarginTap(page, {
      frame: () => null,
      turn: (side) => seen.push(side),
      chrome: () => seen.push('chrome'),
    })
    gesture(page, 20, 20)
    stop()
    expect(seen).toEqual([])
    page.remove()
  })
})

function gesture(el: Element, x: number, y: number, x2 = x, y2 = y) {
  el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }))
  el.dispatchEvent(new PointerEvent('pointerup', { clientX: x2, clientY: y2, bubbles: true }))
  el.dispatchEvent(new MouseEvent('click', { clientX: x2, clientY: y2, bubbles: true }))
}

/** iOS WebKit often skips click after a touch that moved the page. */
function finger(el: Element, x: number, y: number) {
  el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }))
  el.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }))
}
