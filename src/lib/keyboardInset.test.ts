import { describe, expect, it } from 'vitest'
import { keyboardInset } from './keyboardInset'

describe('keyboardInset', () => {
  it('is zero while the visual viewport fills the window', () => {
    expect(keyboardInset(874, 874, 0)).toBe(0)
  })

  it('reports the covered strip when the keyboard shrinks the visual viewport', () => {
    expect(keyboardInset(874, 538, 0)).toBe(336)
  })

  it('accounts for a panned visual viewport and never goes negative', () => {
    expect(keyboardInset(874, 538, 40)).toBe(296)
    expect(keyboardInset(874, 900, 0)).toBe(0)
  })

  it('stays still when the viewport measurements are missing', () => {
    expect(keyboardInset(Number.NaN, 538)).toBe(0)
  })
})
