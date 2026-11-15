import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProgressSaver } from './progressSave'

type Saved = { cfi: string; fraction: number }

const page = (cfi: string, fraction: number): Saved => ({ cfi, fraction })

function setup(save: (value: Saved) => Promise<void>) {
  const onError = vi.fn()
  const saver = createProgressSaver<Saved>({ delay: 400, save, onError })
  return { saver, onError }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createProgressSaver', () => {
  it('waits for the debounce window before writing', async () => {
    const written: Saved[] = []
    const { saver } = setup(async (value) => {
      written.push(value)
    })

    saver.schedule(page('cfi-a', 0.1))
    await vi.advanceTimersByTimeAsync(399)
    expect(written).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(written).toEqual([page('cfi-a', 0.1)])
  })

  it('keeps only the newest value inside the window', async () => {
    const written: Saved[] = []
    const { saver } = setup(async (value) => {
      written.push(value)
    })

    saver.schedule(page('cfi-a', 0.1))
    await vi.advanceTimersByTimeAsync(200)
    saver.schedule(page('cfi-b', 0.2))
    await vi.advanceTimersByTimeAsync(200)
    expect(written).toEqual([])

    await vi.advanceTimersByTimeAsync(200)
    expect(written).toEqual([page('cfi-b', 0.2)])
  })

  it('flushes the value held inside the window when asked', async () => {
    const written: Saved[] = []
    const { saver } = setup(async (value) => {
      written.push(value)
    })

    saver.schedule(page('cfi-a', 0.1))
    saver.schedule(page('cfi-b', 0.2))
    await saver.flush()

    expect(written).toEqual([page('cfi-b', 0.2)])

    // The pending timer must not fire a second write.
    await vi.advanceTimersByTimeAsync(1000)
    expect(written).toEqual([page('cfi-b', 0.2)])
  })

  it('does nothing when flushed with no pending value', async () => {
    const save = vi.fn(async (_value: Saved) => {})
    const { saver } = setup(save)

    await saver.flush()
    await saver.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('serializes writes so a slow store cannot reorder them', async () => {
    const order: string[] = []
    let release: (() => void) | null = null
    const { saver } = setup(async (value) => {
      if (value.cfi === 'slow') await new Promise<void>((resolve) => (release = resolve))
      order.push(value.cfi)
    })

    saver.schedule(page('slow', 0.1))
    const first = saver.flush()
    saver.schedule(page('fast', 0.2))
    const second = saver.flush()

    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual([])
    release?.()
    await Promise.all([first, second])

    expect(order).toEqual(['slow', 'fast'])
  })

  it('reports failures and retries the same value on the next flush', async () => {
    let attempt = 0
    const written: Saved[] = []
    const { saver, onError } = setup(async (value) => {
      attempt += 1
      if (attempt === 1) throw new Error('quota')
      written.push(value)
    })

    saver.schedule(page('cfi-a', 0.1))
    await saver.flush()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[1]).toEqual(page('cfi-a', 0.1))
    expect(written).toEqual([])

    await saver.flush()
    expect(written).toEqual([page('cfi-a', 0.1)])
  })

  it('drops the retry when a newer value is already waiting', async () => {
    const written: Saved[] = []
    let attempt = 0
    const { saver, onError } = setup(async (value) => {
      attempt += 1
      if (attempt === 1) throw new Error('quota')
      written.push(value)
    })

    saver.schedule(page('cfi-a', 0.1))
    const first = saver.flush()
    saver.schedule(page('cfi-b', 0.2))
    await first
    expect(onError).toHaveBeenCalledTimes(1)

    await saver.flush()
    expect(written).toEqual([page('cfi-b', 0.2)])
  })

  it('cancel drops the held value without writing', async () => {
    const save = vi.fn(async (_value: Saved) => {})
    const { saver } = setup(save)

    saver.schedule(page('cfi-a', 0.1))
    saver.cancel()
    await saver.flush()
    await vi.advanceTimersByTimeAsync(1000)

    expect(save).not.toHaveBeenCalled()
  })
})
