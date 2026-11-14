import { afterEach, describe, expect, it } from 'vitest'
import { bindCoverSpread, coverTurn, nextCoverSpread, type SpreadPage } from './coverSpread'

describe('nextCoverSpread', () => {
  it('opens the sentence when the finger slides left', () => {
    expect(nextCoverSpread(0, -48)).toBe(1)
    expect(nextCoverSpread(0, -120)).toBe(1)
  })

  it('returns to the cover when the finger slides right', () => {
    expect(nextCoverSpread(1, 48)).toBe(0)
    expect(nextCoverSpread(1, 90)).toBe(0)
  })

  it('stays put for a short move, and at the end of the spread', () => {
    expect(nextCoverSpread(0, -47)).toBe(0)
    expect(nextCoverSpread(0, 80)).toBe(0)
    expect(nextCoverSpread(1, -80)).toBe(1)
    expect(nextCoverSpread(0, 0)).toBe(0)
  })
})

describe('coverTurn', () => {
  it('ignores a vertical drag and a non-number', () => {
    expect(coverTurn(0, -80, 120)).toBe(0)
    expect(coverTurn(1, 90, -100)).toBe(1)
    expect(coverTurn(1, Number.POSITIVE_INFINITY, 0)).toBe(1)
    expect(coverTurn(0, Number.NaN, 0)).toBe(0)
  })

  it('turns when the slide is at least as sideways as it is vertical', () => {
    expect(coverTurn(0, -48, 10)).toBe(1)
    expect(coverTurn(0, -48, 48)).toBe(1)
    expect(coverTurn(1, 80, -20)).toBe(0)
  })
})

function finger(type: string, x: number, y: number): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  const touch = { clientX: x, clientY: y }
  Object.defineProperty(ev, 'changedTouches', { value: [touch] })
  Object.defineProperty(ev, 'touches', {
    value: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
  })
  Object.setPrototypeOf(ev, TouchEvent.prototype)
  return ev
}

describe('bindCoverSpread', () => {
  const els: HTMLElement[] = []
  const stops: Array<() => void> = []

  afterEach(() => {
    for (const stop of stops) stop()
    stops.length = 0
    for (const el of els) el.remove()
    els.length = 0
  })

  function mount(): HTMLElement {
    const el = document.createElement('div')
    document.body.append(el)
    els.push(el)
    return el
  }

  it('turns the page from the touch point, even when the mouse coordinate is zero', () => {
    const el = mount()
    let page: SpreadPage = 0
    stops.push(bindCoverSpread(el, (dx, dy) => {
      page = coverTurn(page, dx, dy)
    }))
    const cover = document.createElement('img')
    el.append(cover)

    cover.dispatchEvent(finger('touchstart', 180, 80))
    const move = finger('touchmove', 90, 86)
    cover.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(true)
    const end = finger('touchend', 40, 84)
    Object.defineProperty(end, 'clientX', { value: 0 })
    Object.defineProperty(end, 'clientY', { value: 0 })
    cover.dispatchEvent(end)
    expect(page).toBe(1)

    el.dispatchEvent(finger('touchstart', 40, 80))
    el.dispatchEvent(finger('touchend', 40, 200))
    expect(page).toBe(1)

    el.dispatchEvent(finger('touchstart', 30, 80))
    el.dispatchEvent(finger('touchend', 20, 82))
    expect(page).toBe(1)

    el.dispatchEvent(finger('touchstart', 20, 80))
    el.dispatchEvent(finger('touchend', 100, 84))
    expect(page).toBe(0)
  })

  it('turns from a cancelled touch using the last finger point', () => {
    const el = mount()
    const seen: Array<[number, number]> = []
    stops.push(bindCoverSpread(el, (dx, dy) => seen.push([dx, dy])))
    el.dispatchEvent(finger('touchstart', 200, 50))
    el.dispatchEvent(finger('touchmove', 80, 54))
    const cancel = new Event('touchcancel', { bubbles: true, cancelable: true })
    Object.defineProperty(cancel, 'changedTouches', { value: [] })
    Object.defineProperty(cancel, 'touches', { value: [] })
    Object.setPrototypeOf(cancel, TouchEvent.prototype)
    el.dispatchEvent(cancel)
    expect(seen).toEqual([[-120, 4]])
  })

  it('turns when the mouse slides left and releases outside the cover', () => {
    const el = mount()
    let page: SpreadPage = 0
    stops.push(bindCoverSpread(el, (dx, dy) => {
      page = coverTurn(page, dx, dy)
    }))
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 220, clientY: 40, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 60, clientY: 48, bubbles: true }))
    expect(page).toBe(1)
  })
})
