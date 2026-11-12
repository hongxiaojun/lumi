import type { SpeechUnit } from './speech'
import { takeSleepDue } from './sleepTimer'
import { estimateSpeechSeconds, nextSegmentIndex, previousSegmentIndex, skipBySeconds } from './transport'
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
  private pendingOffset = 0
  private mark = 0
  private accumulated = 0
  private now: () => number

  constructor(
    units: readonly SpeechUnit[],
    speaker: Speaker,
    callbacks: PlayerCallbacks,
    now: () => number = Date.now,
  ) {
    this.units = units
    this.speaker = speaker
    this.callbacks = callbacks
    this.now = now
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

  /** Speak one sentence now. Used by the transcript and by a speed change. */
  go(index: number): void {
    if (this.units.length === 0) return
    this.done = false
    this.play(Math.min(Math.max(0, Math.trunc(index)), this.units.length - 1))
  }

  replay(): void {
    if (this.indexValue < 0) return
    this.go(this.indexValue)
  }

  /** First sentence of the next paragraph. The last paragraph ends the chapter. */
  nextSegment(): void {
    if (this.units.length === 0) {
      this.finish()
      return
    }
    if (this.indexValue < 0) {
      this.start(0)
      return
    }
    const index = nextSegmentIndex(this.units, this.indexValue)
    if (index >= this.units.length) {
      this.generation += 1
      this.cancelActive()
      this.finish()
      return
    }
    this.done = false
    this.play(index)
  }

  /** First sentence of the previous paragraph. The opening paragraph restarts. */
  previousSegment(): void {
    if (this.units.length === 0) return
    if (this.indexValue < 0) {
      this.start(0)
      return
    }
    this.done = false
    this.play(previousSegmentIndex(this.units, this.indexValue))
  }

  /**
   * Jump by spoken seconds. A clip that can seek stays inside itself.
   * Otherwise the landing sentence starts at that offset, or at its first word
   * when the engine cannot seek.
   */
  skip(delta: number, rate = 1): void {
    if (this.units.length === 0 || !Number.isFinite(delta) || delta === 0) return
    if (this.indexValue < 0) {
      if (delta > 0) this.start(0)
      return
    }
    const durations = this.units.map((unit, i) =>
      i === this.indexValue ? this.clipSeconds(unit, rate) : estimateSpeechSeconds(unit.text, rate),
    )
    const landing = skipBySeconds(durations, this.indexValue, this.atSeconds(), delta)
    if (landing.pastEnd) {
      this.generation += 1
      this.cancelActive()
      this.finish()
      return
    }
    if (landing.index === this.indexValue) {
      if (this.handle?.seekTo?.(landing.offset)) return
      if (delta > 0) this.next()
      else this.previous()
      return
    }
    this.done = false
    this.play(landing.index, landing.offset)
  }

  pause(): void {
    if (this.stateValue !== 'playing' && this.stateValue !== 'loading') return
    if (this.handle?.pause?.()) {
      this.pausedByHandle = true
      this.freezeClock()
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
      this.mark = this.now()
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

  private play(index: number, offset = 0): void {
    this.generation += 1
    const generation = this.generation
    this.cancelActive()
    this.pausedByHandle = false
    this.pendingOffset = offset
    this.mark = 0
    this.accumulated = 0
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
          this.mark = this.now()
          this.accumulated = 0
          this.setState('playing')
          const offset = this.pendingOffset
          this.pendingOffset = 0
          if (offset > 0.05) this.handle?.seekTo?.(offset)
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
    if (takeSleepDue(this.now())) {
      if (this.indexValue + 1 < this.units.length) this.indexValue += 1
      this.pausedByHandle = false
      this.cancelActive()
      this.setState('paused')
      return
    }
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

  /** Seconds into the current sentence, plus the measured clip length when the engine has one. */
  place(rate = 1): { position: number; duration: number; estimate: number } {
    const unit = this.indexValue >= 0 ? this.units[this.indexValue] : undefined
    const estimate = unit ? estimateSpeechSeconds(unit.text, rate) : 0
    const measured = this.handle?.position?.()
    if (measured && measured.duration > 0) {
      return { position: Math.max(0, measured.current), duration: measured.duration, estimate }
    }
    return { position: this.atSeconds(), duration: 0, estimate }
  }

  private clipSeconds(unit: SpeechUnit, rate: number): number {
    const measured = this.handle?.position?.().duration ?? 0
    if (measured > 0) return measured
    return estimateSpeechSeconds(unit.text, rate)
  }

  private atSeconds(): number {
    const measured = this.handle?.position?.()
    if (measured && measured.duration > 0) return Math.min(Math.max(0, measured.current), measured.duration)
    const running = this.mark ? this.now() - this.mark : 0
    return Math.max(0, (this.accumulated + running) / 1000)
  }

  private freezeClock(): void {
    if (!this.mark) return
    this.accumulated += this.now() - this.mark
    this.mark = 0
  }

  private setState(state: PlaybackState, error?: string): void {
    this.stateValue = state
    this.callbacks.onState(state, error)
  }
}
