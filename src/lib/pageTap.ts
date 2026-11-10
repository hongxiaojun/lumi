// Column pagination stretches the chapter iframe across every page and scrolls
// the visible page into place. A tap has to be measured on that page, or the
// middle of the screen is read as the left or right of the whole chapter.
//
// The page turn lives on the side margin, the way Apple Books does. A wide
// window already has that blank margin. A narrow window keeps a 48px strip
// from the screen edge so a thumb still has somewhere to turn, and the rest
// of the line opens the tools. A pointer that travels is not a tap.

export const TAP_EDGE = 48
export const TAP_SLOP = 10

export type TapPlace = 'text' | 'left' | 'right'

function visibleClip(frame: Element, frameRect: DOMRect): DOMRect {
  const view = frame.ownerDocument.defaultView
  let left = frameRect.left
  let right = frameRect.right
  let top = frameRect.top
  let bottom = frameRect.bottom
  let node = frame.parentElement
  while (node && view) {
    const style = view.getComputedStyle(node)
    if (clips(style)) {
      const rect = node.getBoundingClientRect()
      left = Math.max(left, rect.left)
      right = Math.min(right, rect.right)
      top = Math.max(top, rect.top)
      bottom = Math.min(bottom, rect.bottom)
    }
    node = node.parentElement
  }
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
}

function clips(style: CSSStyleDeclaration): boolean {
  return [style.overflow, style.overflowX, style.overflowY].some((value) => value && value !== 'visible')
}

// `clientX` is in the same viewport as `page`. For a click inside the chapter
// iframe, add the iframe's left edge first: those events are iframe-local.
export function tapPlace(clientX: number, frame: Element, page: Element): TapPlace {
  if (!Number.isFinite(clientX)) return 'text'
  const clip = visibleClip(frame, frame.getBoundingClientRect())
  const pageRect = page.getBoundingClientRect()
  const width = clip.right - clip.left
  if (!(width > 0) || !(pageRect.right > pageRect.left)) return 'text'
  const leftGutter = Math.max(0, clip.left - pageRect.left)
  const rightGutter = Math.max(0, pageRect.right - clip.right)
  const leftEdge = clip.left + Math.max(0, TAP_EDGE - leftGutter)
  const rightEdge = clip.right - Math.max(0, TAP_EDGE - rightGutter)
  if (!(rightEdge > leftEdge)) return 'text'
  if (clientX < leftEdge) return 'left'
  if (clientX > rightEdge) return 'right'
  return 'text'
}

export function tapPage(frame: Element): Element {
  const root = frame.getRootNode()
  if (root instanceof ShadowRoot && root.host instanceof Element) return root.host
  return frame.ownerDocument.documentElement
}

export function tapClaims(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('a[href]')
}

/** A touch point lives on changedTouches. Reading it as a mouse puts the finger at 0. */
export function pointOf(ev: Event): { x: number; y: number } | null {
  if (typeof TouchEvent !== 'undefined' && ev instanceof TouchEvent) {
    const touch = ev.changedTouches[0] ?? ev.touches[0]
    if (!touch) return null
    return { x: touch.clientX, y: touch.clientY }
  }
  if (ev instanceof MouseEvent) return { x: ev.clientX, y: ev.clientY }
  return null
}

// Clicks on the blank margin never enter the chapter iframe. The text column
// is handled separately, with the selection gate.
export function bindMarginTap(page: Element, read: {
  frame: () => Element | null
  turn: (side: 'left' | 'right') => void
  chrome: () => void
}): () => void {
  let x = 0
  let y = 0
  let moved = false
  let touch = false
  const down = (ev: Event) => {
    const point = ev as PointerEvent
    x = point.clientX
    y = point.clientY
    moved = false
    touch = point.pointerType === 'touch'
  }
  const act = (clientX: number, target: EventTarget | null) => {
    if (moved || tapClaims(target)) return
    const frame = read.frame()
    if (!frame) return
    const place = tapPlace(clientX, frame, page)
    if (place === 'left' || place === 'right') read.turn(place)
    else read.chrome()
  }
  const up = (ev: Event) => {
    const point = ev as PointerEvent
    moved = Math.hypot(point.clientX - x, point.clientY - y) > TAP_SLOP
    // A finger on iOS often never produces click after the page moves.
    if (touch) act(point.clientX, ev.target)
  }
  const click = (ev: Event) => {
    if (touch) return
    act((ev as MouseEvent).clientX, ev.target)
  }
  page.addEventListener('pointerdown', down)
  page.addEventListener('pointerup', up)
  page.addEventListener('click', click)
  return () => {
    page.removeEventListener('pointerdown', down)
    page.removeEventListener('pointerup', up)
    page.removeEventListener('click', click)
  }
}
