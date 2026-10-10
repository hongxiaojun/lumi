import { describe, expect, it } from 'vitest'
import { cacheKey } from './hash'

describe('cacheKey', () => {
  it('is stable for the same parts', () => {
    expect(cacheKey(['google', 'en', 'zh-CN', 'Hello'])).toBe(
      cacheKey(['google', 'en', 'zh-CN', 'Hello']),
    )
  })

  it('changes when engine or text changes', () => {
    const a = cacheKey(['google', 'en', 'zh-CN', 'Hello'])
    const b = cacheKey(['microsoft', 'en', 'zh-CN', 'Hello'])
    const c = cacheKey(['google', 'en', 'zh-CN', 'Hello!'])
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })
})
