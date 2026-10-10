import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS } from './styles'
import { lookOf, prefsWithLook } from './bookLook'

describe('prefsWithLook', () => {
  it('uses the device template when this book has never been tuned', () => {
    expect(prefsWithLook(DEFAULT_PREFS, null)).toEqual(DEFAULT_PREFS)
  })

  it('restores this book’s type, paper, and spacing without copying another book', () => {
    const phone = { ...DEFAULT_PREFS, fontSize: 22, theme: 'night' as const, lineHeight: 2 }
    const novel = lookOf({ ...phone, fontSize: 18, theme: 'paper', lineHeight: 1.8, parallel: true })
    const opened = prefsWithLook(phone, novel)
    expect(opened.fontSize).toBe(18)
    expect(opened.theme).toBe('paper')
    expect(opened.lineHeight).toBe(1.8)
    expect(opened.parallel).toBe(phone.parallel)
    expect(prefsWithLook(phone, null).fontSize).toBe(22)
  })
})
