import type { SpeechUnit } from './speech'

export type SpeakHandlers = {
  onStart: () => void
  onBoundary?: (charIndex: number, charLength: number) => void
  onEnd: () => void
  onError: (error: unknown) => void
}

export type SpeakHandle = {
  cancel: () => void
  pause?: () => boolean
  resume?: () => boolean
  /** Seconds into the current clip, when the engine can report them. */
  position?: () => { current: number; duration: number }
  /** Move inside the current clip. False when this engine cannot seek. */
  seekTo?: (seconds: number) => boolean
}

export type Speaker = (
  unit: SpeechUnit,
  handlers: SpeakHandlers,
  /** The next sentences, so a cloud engine can prefetch their audio. */
  upcoming?: readonly SpeechUnit[],
) => SpeakHandle
