import { describe, expect, it } from 'vitest'
import { centerScrollOffset, listenBlockPad } from './listenLayout'

describe('centerScrollOffset', () => {
  it('puts the sentence in the middle of the stage', () => {
    expect(centerScrollOffset(312, 80, 600)).toBe(52)
    expect(centerScrollOffset(5000, 80, 600)).toBe(4740)
  })

  it('does not scroll before the start of the chapter', () => {
    expect(centerScrollOffset(12, 80, 600)).toBe(0)
    expect(centerScrollOffset(0, 40, 0)).toBe(0)
  })
})

describe('listenBlockPad', () => {
  it('reserves half the stage so the opening sentence can be centered', () => {
    expect(listenBlockPad(600)).toBe(300)
    expect(listenBlockPad(0)).toBe(0)
    expect(listenBlockPad(Number.NaN)).toBe(0)
  })
})
