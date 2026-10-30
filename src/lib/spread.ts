import type { FlowId } from '../types'

/** Same measure as the single page. Two pages start only when both still fit. */
export const SPREAD_PAGE_PX = 720

export function spreadColumns(width: number, height: number, flow: FlowId, page = SPREAD_PAGE_PX): 1 | 2 {
  if (flow !== 'paginated') return 1
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1
  if (!(page > 0)) return 1
  if (width <= height) return 1
  if (width < page * 2) return 1
  return 2
}
