import { describe, expect, it } from 'vitest'
import { deviceLabel, freshDevice, readDevice } from './device'

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('device account', () => {
  it('names the account from the device and keeps it on the next read', () => {
    const storage = memory()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const first = readDevice(storage, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17)', () => id)
    const second = readDevice(storage, 'Mozilla/5.0 (Macintosh)', () => 'other')
    expect(deviceLabel('Mozilla/5.0 (iPhone)')).toBe('iPhone')
    expect(first).toEqual(freshDevice('Mozilla/5.0 (iPhone)', id))
    expect(second).toEqual(first)
  })
})
