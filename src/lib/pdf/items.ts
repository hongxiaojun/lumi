import type { PdfRun } from './cluster'
import { normalizePdfText } from './normalize'

type PdfJsItem = {
  str?: string
  width?: number
  height?: number
  transform?: number[]
  hasEOL?: boolean
}

export function runsFromPdfItems(items: PdfJsItem[]): PdfRun[] {
  const runs: PdfRun[] = []
  for (const item of items) {
    const str = normalizePdfText(item.str ?? '')
    if (!str) continue
    const t = item.transform ?? [1, 0, 0, 1, 0, 0]
    const h = Math.abs(t[3] || item.height || 12)
    runs.push({
      str,
      x: t[4] ?? 0,
      y: t[5] ?? 0,
      w: item.width ?? str.length * h * 0.5,
      h: h || 12,
    })
  }
  return runs
}
