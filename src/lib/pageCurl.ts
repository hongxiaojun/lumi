import { GESTURE_SLOP, gestureKind } from 'foliate-js/paginator.js'

export { GESTURE_SLOP }

export type PageSeam = {
  /** Where the page edge crosses the viewport, as a 0–1 fraction. */
  seam: number
  /** How strongly the edge shade shows, 0–1. */
  shade: number
}

/**
 * The paginator moves the chapter under a fixed window. `moved` is the real
 * scroll distance, so a finger at a chapter edge does not paint a seam for a
 * page that is not there.
 */
export function pageSeam(moved: number, size: number): PageSeam {
  if (!Number.isFinite(moved) || !Number.isFinite(size) || !(size > 0)) {
    return { seam: 0.5, shade: 0 }
  }
  const progress = Math.min(1, Math.abs(moved) / size)
  if (!(progress > 0)) return { seam: 0.5, shade: 0 }
  return {
    seam: moved > 0 ? 1 - progress : progress,
    shade: Math.min(1, progress * 2.5),
  }
}

/**
 * Scroll mode follows the finger. A page turn starts only after the finger
 * leaves the tap box and the drag is horizontal. A vertical drag is not a tap,
 * so a corner press that slips downward does not also turn the page.
 */
export function touchFollows(flow: string, dx: number, dy = 0): 'scroll' | 'swipe' | 'tap' {
  if (flow === 'scrolled') return 'scroll'
  const kind = gestureKind(dx, dy)
  if (kind === 'horizontal') return 'swipe'
  if (kind === 'other') return 'scroll'
  return 'tap'
}
