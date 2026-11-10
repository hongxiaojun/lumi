import type { NoteColor } from './notes'

export type ContentRange = {
  range: Range
  text: string
}

export function nodeElement(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}

export function isDecoratedNode(node: Node): boolean {
  const el = nodeElement(node)
  return Boolean(el?.closest?.('[data-leaf-tr], [data-leaf-menu]'))
}

export function clipRangeToContent(range: Range): ContentRange | null {
  const startEl = nodeElement(range.startContainer)
  const endEl = nodeElement(range.endContainer)
  const startTr = startEl?.closest?.('[data-leaf-tr], [data-leaf-menu]')
  const endTr = endEl?.closest?.('[data-leaf-tr], [data-leaf-menu]')
  if (startTr && endTr) return null
  const next = range.cloneRange()
  if (startTr) next.setStartAfter(startTr)
  if (endTr) next.setEndBefore(endTr)
  const text = next.toString().replace(/\s+/g, ' ').trim()
  if (!text || next.collapsed) return null
  return { range: next, text }
}

export function sectionIndexForRange(
  contents: Array<{ doc?: Document; index: number }>,
  range: Range,
): number | null {
  const doc = range.startContainer.ownerDocument
  if (!doc) return null
  const hit = contents.find((c) => c.doc === doc)
  return typeof hit?.index === 'number' ? hit.index : null
}

export type BarAnchor = { top: number; bottom: number; center: number }

/**
 * Where the selection sits inside the element the bar is positioned in. A
 * paginated chapter is one wide column iframe, so the iframe rect must be
 * added before measuring against the reader, and the visible page is only
 * one column of it.
 */
export function rangeMenuPoint(
  range: Range,
  frameHost: HTMLElement,
): BarAnchor | null {
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  const win = range.startContainer.ownerDocument?.defaultView
  const iframe = win?.frameElement as HTMLElement | null
  const hostRect = frameHost.getBoundingClientRect()
  const frameRect = iframe?.getBoundingClientRect() ?? { top: 0, left: 0 }
  return {
    top: frameRect.top + rect.top - hostRect.top,
    bottom: frameRect.top + rect.bottom - hostRect.top,
    center: frameRect.left + rect.left + rect.width / 2 - hostRect.left,
  }
}

export type BarPlace = { top: number; left: number }

export type BarInset = { top: number; bottom: number; left: number; right: number }

const NO_INSET: BarInset = { top: 0, bottom: 0, left: 0, right: 0 }

/**
 * iOS shows its Copy / Look Up menu just below a selection in the upper part
 * of the screen. On the device it covered the pen row when the bar sat only
 * one gap under the text, so a phone placement below the selection first
 * steps over this much menu.
 */
export const NATIVE_MENU_CLEARANCE = 60

function edges(inset: Partial<BarInset>): BarInset {
  return {
    top: Math.max(0, inset.top ?? 0),
    bottom: Math.max(0, inset.bottom ?? 0),
    left: Math.max(0, inset.left ?? 0),
    right: Math.max(0, inset.right ?? 0),
  }
}

/**
 * Keep the bar inside the reachable reading area. `inset` describes the area
 * the bar may use, so the iPhone status bar and home indicator are never
 * covered. On a phone (`belowFirst`), the bar sits below the selection when
 * there is room, which also keeps it clear of iOS's own Copy / Look Up menu
 * above the text. On desktop the bar stays above until it runs out of room.
 * The bar is centred on `left` with translateX(-50%).
 */
export function placeSelectionBar(
  anchor: BarAnchor,
  size: { width: number; height: number },
  bound: { width: number; height: number },
  gap = 8,
  inset: Partial<BarInset> = NO_INSET,
  belowFirst = false,
): BarPlace {
  const pad = edges(inset)
  const minTop = pad.top + gap
  const maxTop = Math.max(minTop, bound.height - pad.bottom - size.height)
  const minLeft = pad.left + gap + size.width / 2
  const maxLeft = Math.max(minLeft, bound.width - pad.right - gap - size.width / 2)
  const left = size.width + gap * 2 >= bound.width - pad.left - pad.right
    ? (pad.left + bound.width - pad.right) / 2
    : Math.min(Math.max(anchor.center, minLeft), maxLeft)

  const above = anchor.top - size.height - gap
  const below = anchor.bottom + gap + (belowFirst ? NATIVE_MENU_CLEARANCE : 0)
  const fits = (top: number) => top >= minTop && top <= maxTop
  const preferred = belowFirst ? below : above
  const other = belowFirst ? above : below
  let top = preferred
  if (!fits(preferred)) {
    // Near the bottom edge, clamping a below placement keeps the bar clear of
    // iOS's own menu above the text. The overlap is line-box leading, not glyphs.
    const closeToBelow = preferred === below && maxTop >= anchor.bottom - 12
    if (closeToBelow) top = maxTop
    else top = fits(other)
      ? other
      : (anchor.top - minTop >= maxTop - anchor.bottom ? above : below)
  }
  return { top: Math.min(Math.max(top, minTop), maxTop), left }
}

export function sameCfi(a: string, b: string): boolean {
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '')
}

export type PenChoice = NoteColor
