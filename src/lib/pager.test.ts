import { describe, expect, it } from 'vitest'
import { createGate, shouldChainChapter, wheelDir } from './pager'

describe('wheelDir', () => {
  it('ignores tiny movement', () => {
    expect(wheelDir(1, 2)).toBe(0)
  })

  it('uses vertical delta when it dominates', () => {
    expect(wheelDir(0, 40)).toBe(1)
    expect(wheelDir(0, -40)).toBe(-1)
  })

  it('uses horizontal delta for trackpad page flicks', () => {
    expect(wheelDir(50, 2)).toBe(1)
    expect(wheelDir(-50, 2)).toBe(-1)
  })
})

describe('shouldChainChapter', () => {
  it('always turns a page in paginated mode', () => {
    expect(shouldChainChapter('paginated', 0.2, 1)).toBe(true)
    expect(shouldChainChapter('paginated', 0.2, -1)).toBe(true)
  })

  it('only leaves a scrolled chapter at the ends', () => {
    expect(shouldChainChapter('scrolled', 0.5, 1)).toBe(false)
    expect(shouldChainChapter('scrolled', 0.99, 1)).toBe(true)
    expect(shouldChainChapter('scrolled', 0.01, -1)).toBe(true)
    expect(shouldChainChapter('scrolled', 0.01, 1)).toBe(false)
  })
})

describe('createGate', () => {
  it('opens then blocks until the window passes', () => {
    const gate = createGate(1000)
    expect(gate()).toBe(true)
    expect(gate()).toBe(false)
  })
})
