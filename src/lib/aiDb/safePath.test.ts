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
    expect(() => assertSafeRel('foo/../..')).toThrow()
  })

  it('rejects a bare dot and dot-slash variants that resolve to the root', () => {
    expect(() => assertSafeRel('.')).toThrow()
    expect(() => assertSafeRel('./')).toThrow()
    expect(() => assertSafeRel('.//.')).toThrow()
  })

  it('rejects empty and absolute paths', () => {
    expect(() => assertSafeRel('')).toThrow()
    expect(() => assertSafeRel('/')).toThrow()
    expect(() => assertSafeRel('/etc/passwd')).toThrow()
    expect(() => assertSafeRel('C:/Windows/system32')).toThrow()
  })
})
