import type { PdfLine } from './cluster'

const ZONE = 0.08
const PAGE_NUM = /^(?:第?\s*)?\d{1,4}(?:\s*[/\u9875of]+\s*\d{1,4})?$/i

export function stripRepeatedMargins(pages: PdfLine[][], pageHeights: number[]): PdfLine[][] {
  if (pages.length < 2) return pages
  const counts = new Map<string, number>()
  pages.forEach((lines, i) => {
    const h = pageHeights[i] ?? 800
    for (const line of lines) {
      if (!inMargin(line, h)) continue
      const key = normalize(line.text)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  })
  const need = Math.max(2, pages.length - 1)
  const drop = new Set(
    [...counts.entries()].filter(([, n]) => n >= need).map(([key]) => key),
  )
  return pages.map((lines, i) => {
    const h = pageHeights[i] ?? 800
    return lines.filter((line) => {
      if (!inMargin(line, h)) return true
      const key = normalize(line.text)
      if (PAGE_NUM.test(key)) return false
      return !drop.has(key)
    })
  })
}

function inMargin(line: PdfLine, pageH: number): boolean {
  const top = pageH * (1 - ZONE)
  const bottom = pageH * ZONE
  return line.y >= top || line.y <= bottom
}

function normalize(text: string): string {
  return text.replace(/\s+/g, '').replace(/\d+/g, '#')
}
