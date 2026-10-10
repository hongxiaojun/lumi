import type { FlowId } from '../types'

export function wheelDir(deltaX: number, deltaY: number): -1 | 0 | 1 {
  const ax = Math.abs(deltaX)
  const ay = Math.abs(deltaY)
  if (ax < 4 && ay < 4) return 0
  if (ay >= ax) return deltaY > 0 ? 1 : -1
  return deltaX > 0 ? 1 : -1
}

export function shouldChainChapter(
  flow: FlowId,
  fraction: number,
  dir: -1 | 0 | 1,
): boolean {
  if (dir === 0) return false
  if (flow === 'paginated') return true
  if (dir === 1) return fraction >= 0.96
  return fraction <= 0.04
}

export function createGate(ms: number): () => boolean {
  let last = 0
  return () => {
    const now = Date.now()
    if (now - last < ms) return false
    last = now
    return true
  }
}

export function attachPager(
  targets: Array<EventTarget | null | undefined>,
  opts: {
    getFlow: () => FlowId
    getFraction: () => number
    next: () => void
    prev: () => void
  },
): () => void {
  const gate = createGate(280)
  const onWheel = (e: Event) => {
    const ev = e as WheelEvent
    const dir = wheelDir(ev.deltaX, ev.deltaY)
    if (dir === 0) return
    const flow = opts.getFlow()
    if (flow === 'paginated') {
      if (!gate()) {
        ev.preventDefault()
        return
      }
      ev.preventDefault()
      if (dir === 1) opts.next()
      else opts.prev()
      return
    }
    if (!shouldChainChapter(flow, opts.getFraction(), dir)) return
    if (!gate()) return
    ev.preventDefault()
    if (dir === 1) opts.next()
    else opts.prev()
  }
  const listening: EventTarget[] = []
  for (const target of targets) {
    if (!target) continue
    target.addEventListener('wheel', onWheel, { passive: false, capture: true })
    listening.push(target)
  }
  return () => {
    for (const target of listening) {
      target.removeEventListener('wheel', onWheel, { capture: true } as AddEventListenerOptions)
    }
  }
}
