import type { SpeechUnit } from './speech'

/** Spoken Chinese at about this many characters per second, before the speed multiplier. */
const HAN_PER_SECOND = 4.2
/** Spoken Latin and digits, before the speed multiplier. */
const LATIN_PER_SECOND = 13
const MIN_CLIP_SECONDS = 0.4

export const SKIP_SECONDS = 5

/** How long this sentence takes to say. Real audio duration wins when the clip is already loaded. */
export function estimateSpeechSeconds(text: string, rate: number): number {
  let han = 0
  let other = 0
  for (const ch of text) {
    if (/[\u3400-\u9fff]/.test(ch)) han += 1
    else if (!/\s/.test(ch)) other += 1
  }
  const speed = Number.isFinite(rate) && rate > 0 ? rate : 1
  const seconds = (han / HAN_PER_SECOND + other / LATIN_PER_SECOND) / speed
  return Math.max(MIN_CLIP_SECONDS, seconds)
}

/** First sentence of the paragraph that contains `index`. */
export function segmentStart(units: readonly Pick<SpeechUnit, 'blockIndex'>[], index: number): number {
  if (units.length === 0) return 0
  const at = Math.min(Math.max(0, Math.trunc(index)), units.length - 1)
  let start = at
  const block = units[at].blockIndex
  while (start > 0 && units[start - 1].blockIndex === block) start -= 1
  return start
}

/** First sentence of the next paragraph, or `units.length` when this paragraph is the last. */
export function nextSegmentIndex(units: readonly Pick<SpeechUnit, 'blockIndex'>[], index: number): number {
  if (units.length === 0) return 0
  const start = segmentStart(units, index)
  const block = units[start].blockIndex
  for (let i = start + 1; i < units.length; i += 1) {
    if (units[i].blockIndex !== block) return i
  }
  return units.length
}

/** First sentence of the previous paragraph. The first paragraph restarts at 0. */
export function previousSegmentIndex(units: readonly Pick<SpeechUnit, 'blockIndex'>[], index: number): number {
  const start = segmentStart(units, index)
  if (start <= 0) return 0
  return segmentStart(units, start - 1)
}

export type SkipLanding = {
  index: number
  /** Seconds into that sentence. */
  offset: number
  /** The skip ran off the end of the chapter. */
  pastEnd: boolean
}

/**
 * Move `delta` seconds through a chapter of clip durations.
 * `at` is how far into `index` playback has already reached.
 */
export function skipBySeconds(
  durations: readonly number[],
  index: number,
  at: number,
  delta: number,
): SkipLanding {
  if (durations.length === 0) return { index: 0, offset: 0, pastEnd: true }
  const clips = durations.map((duration) =>
    Number.isFinite(duration) && duration > 0 ? duration : MIN_CLIP_SECONDS,
  )
  let cursor = Math.min(Math.max(0, Math.trunc(index)), clips.length - 1)
  let remain = Math.min(Math.max(0, at), clips[cursor]) + delta
  if (delta >= 0) {
    while (cursor < clips.length && remain >= clips[cursor]) {
      remain -= clips[cursor]
      cursor += 1
    }
    if (cursor >= clips.length) {
      const last = clips.length - 1
      return { index: last, offset: clips[last], pastEnd: true }
    }
    return { index: cursor, offset: remain, pastEnd: false }
  }
  while (cursor > 0 && remain < 0) {
    cursor -= 1
    remain += clips[cursor]
  }
  if (remain < 0) return { index: 0, offset: 0, pastEnd: false }
  return { index: cursor, offset: remain, pastEnd: false }
}
