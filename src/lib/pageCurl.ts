export const CURL_DRAG = 24

export type CurlDrag = {
  side: 'left' | 'right' | 'stay'
  progress: number
}

/** A finger crossing the page decides the curl. A short move stays a tap. */
export function curlDrag(startX: number, x: number, width: number): CurlDrag {
  const dx = x - startX
  if (!Number.isFinite(dx) || !Number.isFinite(width) || !(width > 0)) return { side: 'stay', progress: 0 }
  if (Math.abs(dx) < CURL_DRAG) return { side: 'stay', progress: 0 }
  const side = dx < 0 ? 'right' : 'left'
  return { side, progress: Math.min(1, Math.abs(dx) / width) }
}

/** Scroll mode follows the finger. Page mode only curls past a short drag. */
export function touchFollows(flow: string, moved: number): 'scroll' | 'curl' | 'tap' {
  if (flow === 'scrolled') return 'scroll'
  if (moved >= CURL_DRAG) return 'curl'
  return 'tap'
}
