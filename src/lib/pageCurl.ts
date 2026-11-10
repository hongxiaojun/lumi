export const SWIPE_DRAG = 24

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

/** Scroll mode follows the finger. Page mode only swipes past a short drag. */
export function touchFollows(flow: string, moved: number): 'scroll' | 'swipe' | 'tap' {
  if (flow === 'scrolled') return 'scroll'
  if (moved >= SWIPE_DRAG) return 'swipe'
  return 'tap'
}
