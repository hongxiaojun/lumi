import { describe, expect, it } from 'vitest'
import { sniffFormat } from './sniff'

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('sniffFormat', () => {
  it('detects PDF by %PDF- magic', () => {
    expect(sniffFormat(bytes('%PDF-1.7\n%âãÏÓ'))).toBe('pdf')
  })

  it('detects ZIP/EPUB by PK', () => {
    expect(sniffFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('zip')
  })

  it('returns unknown for empty or random bytes', () => {
    expect(sniffFormat(new Uint8Array())).toBe('unknown')
    expect(sniffFormat(bytes('not a book'))).toBe('unknown')
  })
})
