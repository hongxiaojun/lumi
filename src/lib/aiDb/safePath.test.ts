import { describe, expect, it } from 'vitest'
import { assertSafeRel } from './safePath'

describe('assertSafeRel', () => {
  it('accepts book-relative paths', () => {
    expect(assertSafeRel('the-unit/AI.md')).toBe('the-unit/AI.md')
    expect(assertSafeRel('INDEX.md')).toBe('INDEX.md')
  })

  it('rejects parent-directory escapes', () => {
    expect(() => assertSafeRel('../secret')).toThrow()
    expect(() => assertSafeRel('a/../../etc/passwd')).toThrow()
  })

  it('rejects empty paths', () => {
    expect(() => assertSafeRel('')).toThrow()
    expect(() => assertSafeRel('/')).toThrow()
  })
})
