import { describe, expect, it, vi } from 'vitest'
import { SpeechPlayer, type PlaybackState } from './player'
import type { SpeechUnit } from './speech'
import type { SpeakHandlers, SpeakHandle, Speaker } from './types'

const units: SpeechUnit[] = [
  { blockIndex: 0, text: '第一句。', start: 0, occurrence: 0 },
  { blockIndex: 0, text: '第二句。', start: 4, occurrence: 0 },
  { blockIndex: 1, text: '第三句。', start: 0, occurrence: 0 },
]

function fakeSpeaker() {
  const calls: {
    unit: SpeechUnit
    handlers: SpeakHandlers
    upcoming: readonly SpeechUnit[]
    handle: SpeakHandle
    cancelled: boolean
  }[] = []
  const speaker: Speaker = (unit, handlers, upcoming = []) => {
    const record = {
      unit,
      handlers,
      upcoming,
      cancelled: false,
      handle: {
        cancel: () => {
          record.cancelled = true
        },
        pause: () => true,
        resume: () => true,
      },
    }
    calls.push(record)
    return record.handle
  }
  return { speaker, calls }
}

function make(callbacks: Partial<ConstructorParameters<typeof SpeechPlayer>[2]> = {}) {
  const fake = fakeSpeaker()
  const states: PlaybackState[] = []
  const seen: number[] = []
  const done = vi.fn()
  const errors: string[] = []
  const player = new SpeechPlayer(units, fake.speaker, {
    onState: (state) => {
      states.push(state)
      callbacks.onState?.(state)
    },
    onUnit: (index) => {
      seen.push(index)
      callbacks.onUnit?.(index)
    },
    onDone: () => {
      done()
      callbacks.onDone?.()
    },
    onError: (message) => {
      errors.push(message)
      callbacks.onError?.(message)
    },
  })
  return { player, fake, states, seen, done, errors }
}

describe('SpeechPlayer', () => {
  it('hands the speaker the next two sentences so cloud audio can prefetch', () => {
    const { player, fake } = make()
    player.start()
    expect(fake.calls[0].upcoming).toEqual([units[1], units[2]])
    fake.calls[0].handlers.onEnd()
    expect(fake.calls[1].upcoming).toEqual([units[2]])
    fake.calls[1].handlers.onEnd()
    expect(fake.calls[2].upcoming).toEqual([])
  })

  it('walks every sentence and finishes once', () => {
    const { player, fake, states, seen, done } = make()
    player.start()
    expect(seen).toEqual([0])
    expect(states).toEqual(['loading'])
    fake.calls[0].handlers.onStart()
    expect(states).toEqual(['loading', 'playing'])
    fake.calls[0].handlers.onEnd()
    expect(seen).toEqual([0, 1])
    fake.calls[1].handlers.onEnd()
    expect(seen).toEqual([0, 1, 2])
    fake.calls[2].handlers.onStart()
    fake.calls[2].handlers.onEnd()
    expect(states.at(-1)).toBe('done')
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('skips and repeats without letting the cancelled sentence advance', () => {
    const { player, fake, seen } = make()
    player.start()
    const first = fake.calls[0]
    player.next()
    expect(first.cancelled).toBe(true)
    expect(seen).toEqual([0, 1])
    first.handlers.onEnd()
    expect(seen).toEqual([0, 1])
    player.previous()
    expect(seen).toEqual([0, 1, 0])
  })

  it('pauses through the speaker and resumes it', () => {
    const { player, fake, states } = make()
    player.start()
    fake.calls[0].handlers.onStart()
    player.pause()
    expect(states).toEqual(['loading', 'playing', 'paused'])
    player.resume()
    expect(states.at(-1)).toBe('playing')
    expect(fake.calls).toHaveLength(1)
  })

  it('restarts the same sentence when the speaker cannot pause', () => {
    const { player, fake, seen } = make()
    player.start()
    const first = fake.calls[0]
    first.handle.pause = () => false
    player.pause()
    expect(first.cancelled).toBe(true)
    player.resume()
    expect(seen).toEqual([0, 0])
  })

  it('reports an error and stops advancing', () => {
    const { player, fake, states, errors, done } = make()
    player.start()
    fake.calls[0].handlers.onError(new Error('没有声音'))
    expect(states.at(-1)).toBe('error')
    expect(errors).toEqual(['没有声音'])
    fake.calls[0].handlers.onEnd()
    expect(done).not.toHaveBeenCalled()
  })

  it('stops without marking the book finished', () => {
    const { player, fake, states, done } = make()
    player.start()
    const first = fake.calls[0]
    player.stop()
    expect(first.cancelled).toBe(true)
    expect(states.at(-1)).toBe('idle')
    expect(done).not.toHaveBeenCalled()
  })
})
