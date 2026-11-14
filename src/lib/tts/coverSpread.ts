import { pointOf } from '../pageTap'

export type SpreadPage = 0 | 1

/** Finger moving left reveals the sentence. Finger moving right returns to the cover. */
export function nextCoverSpread(page: SpreadPage, deltaX: number, threshold = 48): SpreadPage {
  if (deltaX <= -threshold) return 1
  if (deltaX >= threshold) return 0
  return page
}

/**
 * A vertical drag is not a page turn. The phone shelf clips this slot, so a
 * native sideways scroll never has room to move. The finger turns the page.
 */
export function coverTurn(page: SpreadPage, deltaX: number, deltaY: number, threshold = 48): SpreadPage {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return page
  if (Math.abs(deltaY) > Math.abs(deltaX)) return page
  return nextCoverSpread(page, deltaX, threshold)
}

/** Touch, not a mouse coordinate. A touch read as a mouse sits at 0 and would always count as a left slide. */
export function bindCoverSpread(
  el: HTMLElement,
  onGesture: (deltaX: number, deltaY: number) => void,
): () => void {
  let kind: 'touch' | 'mouse' | null = null
  let start: { x: number; y: number } | null = null
  let last: { x: number; y: number } | null = null

  const begin = (ev: Event, next: 'touch' | 'mouse') => {
    const point = pointOf(ev)
    if (!point) return
    kind = next
    start = point
    last = point
  }
  const move = (ev: Event) => {
    if (kind !== 'touch' || !start) return
    const point = pointOf(ev)
    if (!point) return
    last = point
    if (ev.cancelable) ev.preventDefault()
  }
  const finish = (ev: Event, next: 'touch' | 'mouse') => {
    if (kind !== next || !start) return
    const point = pointOf(ev) ?? last
    const from = start
    kind = null
    start = null
    last = null
    if (!point) return
    onGesture(point.x - from.x, point.y - from.y)
  }

  const downMouse = (ev: Event) => begin(ev, 'mouse')
  const upMouse = (ev: Event) => finish(ev, 'mouse')
  const downTouch = (ev: Event) => begin(ev, 'touch')
  const upTouch = (ev: Event) => finish(ev, 'touch')

  el.addEventListener('mousedown', downMouse)
  el.addEventListener('touchstart', downTouch, { passive: true })
  el.addEventListener('touchmove', move, { passive: false })
  el.addEventListener('touchend', upTouch)
  el.addEventListener('touchcancel', upTouch)
  window.addEventListener('mouseup', upMouse)
  return () => {
    el.removeEventListener('mousedown', downMouse)
    el.removeEventListener('touchstart', downTouch)
    el.removeEventListener('touchmove', move)
    el.removeEventListener('touchend', upTouch)
    el.removeEventListener('touchcancel', upTouch)
    window.removeEventListener('mouseup', upMouse)
  }
}
