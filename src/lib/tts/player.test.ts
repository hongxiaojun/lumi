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

  it('replays the current sentence and jumps to a chosen one', () => {
    const { player, fake, seen } = make()
    player.start()
    fake.calls[0].handlers.onStart()
    player.replay()
    expect(fake.calls[0].cancelled).toBe(true)
    expect(fake.calls[1].unit.text).toBe('第一句。')
    player.go(2)
    expect(seen).toEqual([0, 0, 2])
    expect(fake.calls[2].unit.text).toBe('第三句。')
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

  it('jumps a whole paragraph, not one sentence', () => {
    const { player, fake, seen, done } = make()
    player.start()
    fake.calls[0].handlers.onStart()
    player.nextSegment()
    expect(seen).toEqual([0, 2])
    expect(fake.calls[1].unit.text).toBe('第三句。')
    player.previousSegment()
    expect(seen).toEqual([0, 2, 0])
    player.nextSegment()
    player.nextSegment()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('seeks five seconds inside a clip that can seek', () => {
    const { player, fake, seen } = make()
    player.start()
    const sought: number[] = []
    fake.calls[0].handle.position = () => ({ current: 1, duration: 20 })
    fake.calls[0].handle.seekTo = (seconds) => {
      sought.push(seconds)
      return true
    }
    fake.calls[0].handlers.onStart()
    player.skip(5, 1)
    expect(sought).toEqual([6])
    expect(seen).toEqual([0])
  })

  it('carries the leftover seconds into the sentence that contains them', () => {
    const { player, fake, seen } = make()
    const chapter = [
      { blockIndex: 0, text: '中'.repeat(8), start: 0, occurrence: 0 },
      { blockIndex: 0, text: '中'.repeat(8), start: 8, occurrence: 0 },
      { blockIndex: 1, text: '中'.repeat(42), start: 0, occurrence: 0 },
    ]
    const local = new SpeechPlayer(chapter, fake.speaker, {
      onState: () => {},
      onUnit: (index) => seen.push(index),
    }, () => 1_000)
    local.start()
    fake.calls[0].handlers.onStart()
    local.skip(5, 1)
    expect(seen.at(-1)).toBe(2)
    const landed = fake.calls.at(-1)
    const sought: number[] = []
    if (landed) {
      landed.handle.seekTo = (seconds) => {
        sought.push(seconds)
        return true
      }
      landed.handlers.onStart()
    }
    expect(sought[0]).toBeCloseTo(5 - (8 / 4.2) * 2, 5)
  })

  it('stops when five seconds runs past the last sentence', () => {
    const { player, fake, done } = make()
    player.start()
    fake.calls[0].handle.position = () => ({ current: 1, duration: 2 })
    fake.calls[0].handlers.onStart()
    player.skip(5, 1)
    expect(fake.calls[0].cancelled).toBe(true)
    expect(done).toHaveBeenCalledTimes(1)
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
