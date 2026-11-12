import { describe, expect, it } from 'vitest'
import { nextListenChrome, type ListenChrome } from './listenChrome'

const states: ListenChrome[] = ['open', 'mini', 'hidden']

describe('nextListenChrome', () => {
  it('closes only the control window from every state', () => {
    for (const current of states) {
      expect(nextListenChrome(current, 'close')).toBe('hidden')
    }
  })

  it('collapses the open dock to a mini bar and leaves a hidden dock hidden', () => {
    expect(nextListenChrome('open', 'collapse')).toBe('mini')
    expect(nextListenChrome('mini', 'collapse')).toBe('mini')
    expect(nextListenChrome('hidden', 'collapse')).toBe('hidden')
  })

  it('expands back to the full controls', () => {
    expect(nextListenChrome('mini', 'expand')).toBe('open')
    expect(nextListenChrome('hidden', 'expand')).toBe('open')
    expect(nextListenChrome('open', 'expand')).toBe('open')
  })
})
