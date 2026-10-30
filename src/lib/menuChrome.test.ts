import { describe, expect, it } from 'vitest'
import { menuShown, pageMenuPinned, pointerHoldsMenu } from './menuChrome'

describe('menuShown', () => {
  it('stays hidden until the pointer, a pin, or an open panel asks for it', () => {
    expect(menuShown({ pointer: false, pinned: false, panel: false })).toBe(false)
    expect(menuShown({ pointer: true, pinned: false, panel: false })).toBe(true)
    expect(menuShown({ pointer: false, pinned: true, panel: false })).toBe(true)
    expect(menuShown({ pointer: false, pinned: false, panel: true })).toBe(true)
  })
})

describe('pageMenuPinned', () => {
  it('lets a mouse click close panels without raising the menu', () => {
    expect(pageMenuPinned({ touch: false, panel: false, pinned: false })).toBe(false)
    expect(pageMenuPinned({ touch: false, panel: true, pinned: false })).toBe(false)
    expect(pageMenuPinned({ touch: false, panel: false, pinned: true })).toBe(true)
  })

  it('toggles on a touch tap, and puts the menu away when that tap closes a panel', () => {
    expect(pageMenuPinned({ touch: true, panel: false, pinned: false })).toBe(true)
    expect(pageMenuPinned({ touch: true, panel: false, pinned: true })).toBe(false)
    expect(pageMenuPinned({ touch: true, panel: true, pinned: true })).toBe(false)
    expect(pageMenuPinned({ touch: true, panel: true, pinned: false })).toBe(false)
  })
})

describe('pointerHoldsMenu', () => {
  it('treats a touch as a tap, and a mouse or pen as hovering the top edge', () => {
    expect(pointerHoldsMenu('mouse')).toBe(true)
    expect(pointerHoldsMenu('pen')).toBe(true)
    expect(pointerHoldsMenu('')).toBe(true)
    expect(pointerHoldsMenu('touch')).toBe(false)
  })
})
