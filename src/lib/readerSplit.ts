export const SIDEBAR_DEFAULT = 320
export const SIDEBAR_MIN = 220
export const PAGE_MIN = 320

export type SidebarSide = 'none' | 'left' | 'right'
export type PanelPlace = 'column' | 'sheet'

/** A sidebar beside the page only fits when both keep their minimum. */
export function panelPlace(viewport: number): PanelPlace {
  if (viewport >= PAGE_MIN + SIDEBAR_MIN) return 'column'
  return 'sheet'
}

/** Visible sidebar range for this window. The page keeps at least PAGE_MIN. */
export function sidebarBand(viewport: number): { min: number; max: number } {
  if (!(viewport > 0)) return { min: 0, max: 0 }
  const max = Math.max(0, viewport - PAGE_MIN)
  return { min: Math.min(SIDEBAR_MIN, max), max }
}

export function clampSidebar(viewport: number, requested: number, side: SidebarSide): number {
  if (side === 'none' || !(viewport > 0)) return 0
  const { min, max } = sidebarBand(viewport)
  const value = Number.isFinite(requested) ? requested : min
  return Math.round(Math.min(max, Math.max(min, value)))
}

export function nextSidebar(side: 'left' | 'right', start: number, dx: number): number {
  if (!Number.isFinite(dx)) return start
  return side === 'left' ? start + dx : start - dx
}

/** Next stored width. `shown` is the width on screen; a drag that cannot move it keeps `wanted`. */
export function sidebarAfterDrag(
  viewport: number,
  side: 'left' | 'right',
  shown: number,
  wanted: number,
  dx: number,
): number {
  const next = nextSidebar(side, shown, dx)
  if (!Number.isFinite(next)) return wanted
  const visible = clampSidebar(viewport, Math.round(next), side)
  if (visible === shown) return wanted
  return visible
}
