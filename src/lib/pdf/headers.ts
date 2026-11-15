import type { PdfLine } from './cluster'

const ZONE = 0.08
/** A folio, in the shapes real books use: 12, -12-, 12/345, 12 of 345, 第12页,
 * 第12页/共345页, Page 12, iv, XII. The whole line has to match, so a numbered
 * list item ("1. 引言") or a year inside a sentence never qualifies. */
const FOLIO = new RegExp(
  '^(?:' +
    '第\\s*[0-9]+\\s*页(?:\\s*[/,，]?\\s*共\\s*[0-9]+\\s*页)?' +
    '|[0-9]+\\s*/\\s*[0-9]+' +
    '|[0-9]+\\s+(?:of|/)\\s+[0-9]+' +
    '|page\\s+[0-9]+(?:\\s+of\\s+[0-9]+)?' +
    '|[0-9]+' +
    '|[ivxlcdm]+' +
    ')$',
  'i',
)
const LEAD = /^[\s\-–—·•]+/
const TAIL = /[\s\-–—·•]+$/

export function stripRepeatedMargins(pages: PdfLine[][], pageHeights: number[]): PdfLine[][] {
  const drop = repeatedMargins(pages, pageHeights)
  return pages.map((lines, i) => {
    const h = pageHeights[i] ?? 800
    return lines.filter((line) => {
      if (!inMargin(line, h)) return true
      // A folio is furniture even when it appears once: its number changes from
      // page to page, so the repeat test below can only catch it by masking.
      if (isFolio(line.text)) return false
      return !drop.has(normalize(line.text))
    })
  })
}

function repeatedMargins(pages: PdfLine[][], pageHeights: number[]): Set<string> {
  if (pages.length < 2) return new Set()
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
  return new Set([...counts.entries()].filter(([, n]) => n >= need).map(([key]) => key))
}

function inMargin(line: PdfLine, pageH: number): boolean {
  const top = pageH * (1 - ZONE)
  const bottom = pageH * ZONE
  return line.y >= top || line.y <= bottom
}

function isFolio(text: string): boolean {
  const bare = text
    .replace(LEAD, '')
    .replace(TAIL, '')
    .replace(/[\uFF10-\uFF19]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
  return FOLIO.test(bare)
}

function normalize(text: string): string {
  return text.replace(/\s+/g, '').replace(/\d+/g, '#')
}
