import { rangeForSpoken } from './readAloud'
import type { SpeechUnit } from './tts/speech'

/**
 * Immersive listening wash: inside the spoken paragraph, sentences other than
 * the one being read get a paper-colored overlay so the current sentence reads
 * as the brightest line, lyrics-style. Overlay-only — no extra blur passes, so
 * the cost is a handful of ranges per sentence turn.
 */

export const WASH_PREFIX = 'leaf-wash'

type Painter = { add: (key: string, range: Range) => void; remove: (key: string) => void }

let washed = new Set<string>()

/**
 * Wash every sibling sentence in the current paragraph except the current one.
 * Keys are unit indexes, so moving to the next sentence only touches the two
 * keys that actually changed.
 */
export function paintListenWash(
  units: readonly SpeechUnit[],
  currentIndex: number,
  sources: readonly Element[],
  painter: Painter,
): void {
  const wanted = new Map<string, Range[]>()
  const block = units[currentIndex]?.blockIndex
  if (block == null) {
    clearListenWash(painter)
    return
  }
  for (let i = 0; i < units.length; i += 1) {
    if (i === currentIndex) continue
    const u = units[i]
    if (u.blockIndex !== block) continue
    const mapped = rangeForSpoken(sources[u.blockIndex], u.text, null, null, u.occurrence)
    if (!mapped) continue
    wanted.set(`${WASH_PREFIX}-${i}`, mapped.line)
  }
  for (const key of washed) {
    if (!wanted.has(key)) {
      painter.remove(key)
      washed.delete(key)
    }
  }
  for (const [key, ranges] of wanted) {
    if (washed.has(key)) continue
    for (const range of ranges) painter.add(key, range)
    washed.add(key)
  }
}

/** Remove every wash key, e.g. when listening stops or the chapter clears. */
export function clearListenWash(painter: Painter): void {
  for (const key of washed) painter.remove(key)
  washed = new Set()
}
