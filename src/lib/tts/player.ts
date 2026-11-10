import type { SpeechUnit } from './speech'
import type { Speaker, SpeakHandle } from './types'

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'done' | 'error'

export type PlayerCallbacks = {
  onState: (state: PlaybackState, error?: string) => void
  onUnit: (index: number) => void
  onBoundary?: (index: number, charIndex: number, charLength: number) => void
  onDone?: () => void
  onError?: (message: string) => void
}

/**
 * One sentence at a time. A generation token keeps a cancelled utterance's
 * late `end` event from advancing the new one.
 */
export class SpeechPlayer {
  private units: readonly SpeechUnit[]
  private speaker: Speaker
  private callbacks: PlayerCallbacks
  private handle: SpeakHandle | null = null
  private generation = 0
  private done = false
  private pausedByHandle = false
  private stateValue: PlaybackState = 'idle'
  private indexValue = -1

  constructor(units: readonly SpeechUnit[], speaker: Speaker, callbacks: PlayerCallbacks) {
    this.units = units
    this.speaker = speaker
    this.callbacks = callbacks
  }

  get state(): PlaybackState {
    return this.stateValue
  }

  get index(): number {
    return this.indexValue
  }

  start(index = 0): void {
    if (this.units.length === 0) {
      this.finish()
      return
    }
    this.done = false
    this.play(Math.min(Math.max(0, index), this.units.length - 1))
  }

  next(): void {
    if (this.units.length === 0) {
      this.finish()
      return
    }
    if (this.indexValue + 1 >= this.units.length) {
      this.finish()
      return
    }
    this.play(this.indexValue + 1)
  }

  previous(): void {
    if (this.units.length === 0) return
    this.play(Math.max(0, this.indexValue - 1))
  }

  pause(): void {
    if (this.stateValue !== 'playing' && this.stateValue !== 'loading') return
    if (this.handle?.pause?.()) {
      this.pausedByHandle = true
      this.setState('paused')
      return
    }
    this.pausedByHandle = false
    this.cancelActive()
    this.setState('paused')
  }

  resume(): void {
    if (this.stateValue !== 'paused') return
    if (this.pausedByHandle && this.handle?.resume?.()) {
      this.setState('playing')
      return
    }
    this.play(Math.max(0, this.indexValue))
  }

  stop(): void {
    this.generation += 1
    this.cancelActive()
    this.setState('idle')
  }

  private play(index: number): void {
    this.generation += 1
    const generation = this.generation
    this.cancelActive()
    this.pausedByHandle = false
    this.indexValue = index
    this.setState('loading')
    const unit = this.units[index]
    if (!unit) {
      this.finish()
      return
    }
    this.callbacks.onUnit(index)
    try {
      this.handle = this.speaker(unit, {
        onStart: () => {
          if (generation !== this.generation) return
          this.setState('playing')
        },
        onBoundary: (charIndex, charLength) => {
          if (generation !== this.generation) return
          this.callbacks.onBoundary?.(index, charIndex, charLength)
        },
        onEnd: () => {
          if (generation !== this.generation) return
          this.advance()
        },
        onError: (error) => {
          if (generation !== this.generation) return
          const message = error instanceof Error ? error.message : '朗读没有出声'
          this.setState('error', message)
          this.callbacks.onError?.(message)
        },
      }, this.units.slice(index + 1, index + 3))
    } catch (error) {
      const message = error instanceof Error ? error.message : '朗读没有出声'
      this.setState('error', message)
      this.callbacks.onError?.(message)
    }
  }

  private advance(): void {
    if (this.indexValue + 1 < this.units.length) {
      this.play(this.indexValue + 1)
      return
    }
    this.finish()
  }

  private finish(): void {
    if (this.done) return
    this.done = true
    this.setState('done')
    this.callbacks.onDone?.()
  }

  private cancelActive(): void {
    const handle = this.handle
    this.handle = null
    if (!handle) return
    try {
      handle.cancel()
    } catch {
      // A cancelled utterance is already silent.
    }
  }

  private setState(state: PlaybackState, error?: string): void {
    this.stateValue = state
    this.callbacks.onState(state, error)
  }
}
