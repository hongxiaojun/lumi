import { describe, expect, it } from 'vitest'
import { randomId } from './id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomId', () => {
  it('uses getRandomValues when randomUUID is missing, as on an iPhone over http', () => {
    const source = {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0xab)
      },
    } as Crypto
    expect(randomId(source)).toMatch(UUID)
    expect(randomId(source)).not.toBe(randomId({ getRandomValues(bytes: Uint8Array) { bytes.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) } } as Crypto))
  })
})
