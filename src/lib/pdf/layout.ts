/** Reading order for multi-column PDF pages (M13).
 *
 * pdf.js hands us every text run with its own baseline, and on a two-column page
 * both columns share baselines. Grouping runs into lines and then sorting lines
 * back into y order interleaves the columns, and the paragraph merge downstream
 * (typeset.ts) trusts that order, so the book reads as gibberish without failing.
 *
 * This is the textbook projection-profile cut (XY-cut, Nagy & Seth 1984) that
 * pdfplumber and PyMuPDF use: a gutter is a vertical band no line crosses.
 */

import { LINE_SPLIT_EM, type PdfLine } from './cluster'

/** Page geometry in unrotated PDF user space — the same space as PdfLine.x.
 * Rotation is deliberately absent: x is already unrotated, so there is nothing
 * left for this module to correct. */
export type PageBox = { width: number; height: number }

type Side = 'left' | 'right' | 'span'
type Entry = { line: PdfLine; side: Side }
type Strip = { left: PdfLine[]; right: PdfLine[]; span: PdfLine[] }
type Gutter = { from: number; to: number }
type Metrics = { h: number; minX: number; maxX: number }

const MIN_LINES = 8
/** Share of lines allowed to cross a gutter. A genuine gutter is crossed by
 * none; this absorbs a stray URL or a caption rule. */
const CROSS_SHARE = 0.04
const MIN_COLUMN_LINES = 4
const MIN_COLUMN_SHARE = 0.22
/** Share of lines that may bridge the gutter: a headline, a table rule. */
const MAX_SPAN_LINES = 0.25
/** Share of horizontal bands that may hold such a line. A table repeats its
 * header or rule in every band; a two-column article spans a band or two. */
const MAX_SPANNED_BANDS = 0.5
/** Body lines are long relative to the type size; table cells and index
 * entries are not. Measured in em so it holds at any point size. */
const MIN_LINE_EM = 8
/** A table of contents is a wide title column beside a narrow page-number
 * column; equal-ish widths is the cheapest way to tell it from a real layout. */
const MIN_WIDTH_RATIO = 0.4
const BAND_EM = 2.2
const MAX_DEPTH = 2
/** A line this wide relative to the text block is a headline, a table rule or a
 * figure caption, not column text. Leaving those out of the projection is what
 * lets a page with a full-width headline still show its two gutters. */
const SPAN_WIDTH = 0.8

/** Column leaves left to right, or null when the page reads as single column. */
export function detectColumns(lines: PdfLine[], page: PageBox): PdfLine[][] | null {
  const leaves = split(lines, page, 0)
  return leaves.length > 1 ? leaves : null
}

/** Flat reading order. Returns the same array when the page is single column. */
export function orderPageLines(lines: PdfLine[], page: PageBox): PdfLine[] {
  const leaves = detectColumns(lines, page)
  return leaves ? leaves.flat() : lines
}

function split(lines: PdfLine[], page: PageBox, depth: number): PdfLine[][] {
  if (lines.length < MIN_LINES || depth > MAX_DEPTH) return [byHeight(lines)]
  const metrics = measure(lines, page, depth)
  if (!metrics) return [byHeight(lines)]
  for (const gutter of gutters(lines, metrics)) {
    const entries = classify(lines, gutter)
    if (!accept(entries, metrics)) continue
    const out: PdfLine[][] = []
    for (const strip of strips(entries)) {
      if (strip.span.length) out.push(byHeight(strip.span))
      for (const side of [strip.left, strip.right]) {
        if (side.length) out.push(...split(side, page, depth + 1))
      }
    }
    return out
  }
  return [byHeight(lines)]
}

function measure(lines: PdfLine[], page: PageBox, depth: number): Metrics | null {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (const line of lines) {
    minX = Math.min(minX, line.x0)
    maxX = Math.max(maxX, line.x1)
  }
  if (!Number.isFinite(minX) || maxX <= minX) return null
  // A title page or a footnote-only page occupies a narrow block in a wide
  // page; cutting it in half would be worse than leaving it alone.
  if (depth === 0 && page.width > 0 && maxX - minX < 0.5 * page.width) return null
  return { h: bodySize(lines), minX, maxX }
}

/** Character-weighted median: a page of short figure captions must not drag
 * the body size down the way a plain median or a mean would. */
function bodySize(lines: PdfLine[]): number {
  const sizes = lines
    .map((line) => [line.h, Math.max(1, line.text.replace(/\s+/g, '').length)] as const)
    .sort((a, b) => a[0] - b[0])
  const total = sizes.reduce((n, [, weight]) => n + weight, 0)
  let seen = 0
  for (const [size, weight] of sizes) {
    seen += weight
    if (seen * 2 >= total) return Math.max(1, size)
  }
  return 12
}

/** Every band of the page that no solid line crosses, widest first.
 *
 * The widest band is the usual answer, but not always: a magazine prints a
 * furniture column against the right edge, and the margin beside it is wider
 * than the real gutter. Ranking them lets the caller reject that band and try
 * the next. On a tie the band nearest the middle wins, which on a three-column
 * page is the cut that leaves two whole columns.
 */
function gutters(lines: PdfLine[], m: Metrics): Gutter[] {
  const span = m.maxX - m.minX
  const solids = lines.filter((line) => line.x1 - line.x0 < SPAN_WIDTH * span)
  if (solids.length < MIN_LINES) return []
  const deltas = new Map<number, number>()
  for (const line of solids) {
    deltas.set(line.x0, (deltas.get(line.x0) ?? 0) + 1)
    deltas.set(line.x1, (deltas.get(line.x1) ?? 0) - 1)
  }
  const xs = [...deltas.keys()].sort((a, b) => a - b)
  const tol = Math.max(1, CROSS_SHARE * lines.length)
  const minGap = Math.max(LINE_SPLIT_EM * m.h, 0.02 * span)
  const found: Gutter[] = []
  let cover = 0
  let open: number | null = null
  for (let i = 0; i < xs.length; i += 1) {
    cover += deltas.get(xs[i]) ?? 0
    const next = xs[i + 1]
    if (next === undefined) break
    if (cover <= tol) {
      if (open === null) open = xs[i]
      continue
    }
    if (open !== null) {
      if (xs[i] - open >= minGap) found.push({ from: open, to: xs[i] })
      open = null
    }
  }
  if (open !== null && m.maxX - open >= minGap) found.push({ from: open, to: m.maxX })
  const centre = (m.minX + m.maxX) / 2
  const mid = (g: Gutter) => Math.abs((g.from + g.to) / 2 - centre)
  return found.sort((a, b) => b.to - b.from - (a.to - a.from) || mid(a) - mid(b))
}

function classify(lines: PdfLine[], gutter: Gutter): Entry[] {
  return lines.map((line) => {
    if (line.x0 <= gutter.from && line.x1 >= gutter.to) return { line, side: 'span' as Side }
    if (line.x1 <= gutter.from) return { line, side: 'left' as Side }
    if (line.x0 >= gutter.to) return { line, side: 'right' as Side }
    // Straddling the gutter without bridging it: go with the side that holds
    // more of the line. Both shares can be negative, which is the ordinary case
    // of a line that ends short of the gutter or starts past it.
    const left = gutter.from - line.x0
    const right = line.x1 - gutter.to
    return { line, side: left >= right ? ('left' as Side) : ('right' as Side) }
  })
}

function accept(entries: Entry[], m: Metrics): boolean {
  const n = entries.length
  const left = entries.filter((e) => e.side === 'left')
  const right = entries.filter((e) => e.side === 'right')
  const span = entries.filter((e) => e.side === 'span')
  const need = Math.max(MIN_COLUMN_LINES, MIN_COLUMN_SHARE * n)
  if (left.length < need || right.length < need) return false
  if (span.length > MAX_SPAN_LINES * n) return false

  // Both tests below read the median line width of each side rather than its
  // distance to the gutter: a page number printed in the outer margin, or a
  // figure bled off the edge, moves maxX without saying anything about the text
  // columns, and would otherwise sink a page that splits perfectly well.
  const leftEm = medianLineEm(left)
  const rightEm = medianLineEm(right)
  if (leftEm < MIN_LINE_EM || rightEm < MIN_LINE_EM) return false
  if (Math.min(leftEm, rightEm) / Math.max(leftEm, rightEm) < MIN_WIDTH_RATIO) return false

  return spannedShare(entries, m.h) <= MAX_SPANNED_BANDS
}

function medianLineEm(entries: Entry[]): number {
  const widths = entries
    .map((entry) => (entry.line.x1 - entry.line.x0) / Math.max(1, entry.line.h))
    .sort((a, b) => a - b)
  return widths[Math.floor(widths.length / 2)] ?? 0
}

/** Share of horizontal bands (measured in line heights) that hold a spanning
 * line. High means the "columns" are table rows, not text columns. */
function spannedShare(entries: Entry[], h: number): number {
  const top = Math.max(...entries.map((entry) => entry.line.y))
  const size = Math.max(1, BAND_EM * h)
  const filled = new Set<number>()
  const spanned = new Set<number>()
  for (const entry of entries) {
    const band = Math.floor((top - entry.line.y) / size)
    filled.add(band)
    if (entry.side === 'span') spanned.add(band)
  }
  return filled.size ? spanned.size / filled.size : 1
}

/** Split the page into horizontal strips at spanning lines, so a full-width
 * headline or table row stays at its own height instead of being copied into
 * a column. */
function strips(entries: Entry[]): Strip[] {
  const out: Strip[] = []
  let current: Strip = { left: [], right: [], span: [] }
  const ordered = [...entries].sort(
    (a, b) => b.line.y - a.line.y || a.line.x0 - b.line.x0,
  )
  for (const entry of ordered) {
    if (entry.side === 'span') {
      if (current.left.length || current.right.length) out.push(current)
      out.push({ left: [], right: [], span: [entry.line] })
      current = { left: [], right: [], span: [] }
      continue
    }
    current[entry.side].push(entry.line)
  }
  if (current.left.length || current.right.length) out.push(current)
  return out
}

function byHeight(lines: PdfLine[]): PdfLine[] {
  return [...lines].sort((a, b) => b.y - a.y || a.x0 - b.x0)
}
