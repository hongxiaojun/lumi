import type { FlowId } from '../types'

/** Foliate counts one location as 1500 bytes. Scrolled mode has no columns, so a page is that. */
const PAGE_BYTES = 1500

/** The paginator’s header and footer are exactly this tall. The page number lives in it. */
export const PAGE_MARGIN_PX = 48

export type FootLabel = { page: string; rest: string }

export type LayoutFootInput = {
  flow: FlowId
  columns: number
  /** Paginator viewport index, including the blank page it keeps before the chapter. */
  page: number
  /** Viewport count, including the blank page before and after the chapter. */
  pages: number
  sectionSizes: readonly number[]
  index: number
  locationCurrent: number
  locationTotal: number
  sectionFraction: number
}

function pageNo(n: number, total: number): string {
  return `${n}/${total}页`
}

function restNo(n: number): string {
  return n > 0 ? `本章还剩${n}页` : ''
}

/** One label per column. The last real page carries how many pages the chapter still has. */
export function columnFoot(input: {
  columns: number
  at: number
  sectionPages: number
  before: number
  total: number
}): FootLabel[] {
  const columns = input.columns === 2 ? 2 : 1
  const at = Number.isFinite(input.at) ? Math.max(0, Math.floor(input.at)) : 0
  const sectionPages = Number.isFinite(input.sectionPages) ? Math.max(0, Math.floor(input.sectionPages)) : 0
  const before = Number.isFinite(input.before) ? Math.max(0, Math.floor(input.before)) : 0
  const lastReal = Math.min(sectionPages, at + columns) - 1
  let total = Number.isFinite(input.total) ? Math.max(0, Math.floor(input.total)) : 0
  if (lastReal >= at) total = Math.max(total, before + lastReal + 1)
  const labels: FootLabel[] = []
  for (let i = 0; i < columns; i++) {
    const index = at + i
    if (sectionPages < 1 || index > lastReal || total < 1) {
      labels.push({ page: '', rest: '' })
      continue
    }
    labels.push({
      page: pageNo(before + index + 1, total),
      rest: index === lastReal ? restNo(sectionPages - index - 1) : '',
    })
  }
  return labels
}

function scrolledFoot(input: LayoutFootInput): FootLabel[] | null {
  const total = Math.floor(input.locationTotal)
  const current = Math.floor(input.locationCurrent)
  if (!(total > 0) || current < 0) return null
  const size = input.sectionSizes[input.index] ?? 0
  const fraction = Number.isFinite(input.sectionFraction)
    ? Math.min(1, Math.max(0, input.sectionFraction))
    : 0
  const remain = size > 0 ? Math.max(0, Math.ceil((1 - fraction) * size / PAGE_BYTES) - 1) : 0
  return [{ page: pageNo(Math.min(current + 1, total), total), rest: restNo(remain) }]
}

/**
 * Paginated pages come from the open chapter’s real columns.
 * Earlier chapters use that same page size, so the book total tracks the window.
 */
export function layoutFoot(input: LayoutFootInput): FootLabel[] | null {
  if (input.flow !== 'paginated') return scrolledFoot(input)
  const viewports = input.pages - 2
  const viewport = input.page - 1
  if (viewports < 1 || viewport < 0 || viewport >= viewports) return null
  const columns = input.columns === 2 ? 2 : 1
  const size = input.sectionSizes[input.index] ?? 0
  if (!(size > 0)) return null
  const per = size / viewports
  if (!(per > 0)) return null
  let beforeViewports = 0
  let totalViewports = 0
  for (let i = 0; i < input.sectionSizes.length; i++) {
    const s = input.sectionSizes[i] ?? 0
    if (!(s > 0)) continue
    const count = i === input.index ? viewports : Math.max(1, Math.round(s / per))
    if (i < input.index) beforeViewports += count
    totalViewports += count
  }
  const sectionPages = viewports * columns
  const before = beforeViewports * columns
  return columnFoot({
    columns,
    at: viewport * columns,
    sectionPages,
    before,
    total: totalViewports * columns,
  })
}

/** The footer slot is one element per column. The remainder sits on the right of its page. */
export function paintPageFeet(feet: Array<HTMLElement | undefined> | null | undefined, labels: FootLabel[] | null) {
  if (!feet) return
  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i]
    if (!foot) continue
    const label = labels?.[i]
    foot.replaceChildren()
    foot.style.position = 'relative'
    foot.style.fontSize = '13px'
    foot.style.opacity = '0.72'
    if (!label?.page) continue
    const page = document.createElement('span')
    page.textContent = label.page
    foot.append(page)
    if (!label.rest) continue
    const rest = document.createElement('span')
    rest.textContent = label.rest
    rest.style.position = 'absolute'
    rest.style.right = '0'
    rest.style.top = '0'
    rest.style.bottom = '0'
    rest.style.display = 'flex'
    rest.style.alignItems = 'center'
    foot.append(rest)
  }
}
