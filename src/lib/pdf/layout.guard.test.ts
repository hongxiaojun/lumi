import { describe, expect, it } from 'vitest'

import type { PdfLine } from './cluster'
import { detectColumns, orderPageLines, type PageBox } from './layout'

/** Every case here must fall back to single column. A false positive is much
 * worse than a missed gutter: it shreds the page into out-of-order fragments
 * that the paragraph merge then welds together without any error. */
const PAGE: PageBox = { width: 595, height: 842 }

function line(text: string, x0: number, y: number, w: number, h = 12): PdfLine {
  return { text, x0, x1: x0 + w, y, h }
}

function column(
  prefix: string,
  x0: number,
  yTop: number,
  count: number,
  w: number,
  step = 14,
): PdfLine[] {
  return Array.from({ length: count }, (_, i) =>
    line(`${prefix}${i}`, x0, yTop - i * step, w),
  )
}

function expectSingle(lines: PdfLine[]): void {
  expect(detectColumns(lines, PAGE)).toBeNull()
  expect(orderPageLines(lines, PAGE)).toBe(lines)
}

describe('detectColumns guards', () => {
  it('ignores a page with fewer than eight lines', () => {
    const lines = [...column('L', 72, 780, 4, 211), ...column('R', 311, 780, 3, 212)]
    expectSingle(lines)
  })

  it('treats a table as one block, not two columns', () => {
    // Three 90pt cells per row: the gaps are real gutters, but 7.5 em of text
    // per cell is a table cell, not a measure of body type.
    const rows: PdfLine[] = []
    for (let i = 0; i < 12; i += 1) {
      const y = 780 - i * 16
      rows.push(line(`a${i}`, 72, y, 90), line(`b${i}`, 186, y, 90), line(`c${i}`, 300, y, 90))
    }
    expectSingle(rows)
  })

  it('leaves a centred title page alone', () => {
    // The text block covers 228pt of a 595pt page: too narrow to be columns.
    const lines = Array.from({ length: 10 }, (_, i) =>
      line(`Title ${i}`, 184, 500 - i * 24, 228),
    )
    expectSingle(lines)
  })

  it('leaves short ragged lines alone', () => {
    // Two narrow blocks of poetry, 80pt wide over 12pt type: 6.7 em.
    const lines = [...column('L', 72, 780, 10, 80), ...column('R', 380, 780, 10, 80)]
    expectSingle(lines)
  })

  it('does not cut a page in half for a two-line sidebar', () => {
    const lines = [...column('L', 72, 780, 12, 211), ...column('R', 311, 780, 2, 212)]
    expectSingle(lines)
  })

  it('does not cut for a three-line pull quote', () => {
    // Three lines is a pull quote or a figure label, never a column.
    const lines = [...column('L', 72, 780, 9, 211), ...column('R', 311, 780, 3, 212)]
    expectSingle(lines)
  })

  it('does not split a body column from a narrow sidebar', () => {
    // 318pt of body beside a 100pt note column: real in Tufte-style books, but
    // the reading order stays body-then-note, so the note is not a column.
    const lines = [...column('L', 72, 780, 20, 318), ...column('R', 420, 780, 20, 100)]
    expectSingle(lines)
  })

  it('does not treat a few trailing lines as a second column', () => {
    // Six lines against thirty-four: too lopsided to be a two-column page.
    const lines = [...column('L', 72, 780, 34, 211), ...column('R', 311, 780, 6, 212)]
    expectSingle(lines)
  })

  it('does not cut a rules-and-briefs digest into columns', () => {
    // A rule across every band means the page reads row by row, not column by
    // column, even though each band holds real column text.
    const lines: PdfLine[] = []
    for (let band = 0; band < 8; band += 1) {
      const base = 780 - band * 28
      lines.push(line(`rule ${band}`, 72, base, 451))
      lines.push(line(`l${band}a`, 72, base - 9, 211), line(`l${band}b`, 72, base - 18, 211))
      lines.push(line(`r${band}a`, 311, base - 9, 212), line(`r${band}b`, 311, base - 18, 212))
    }
    expectSingle(lines)
  })

  it('leaves a page holding a dense spanning table alone', () => {
    // Two columns of body above a full-width table. The table is a small part
    // of the page, so a per-band measure would wave it through; counting the
    // spanning lines is what keeps a table from being read as column text.
    const lines = [...column('L', 72, 780, 20, 211), ...column('R', 311, 780, 20, 212)]
    for (let i = 0; i < 18; i += 1) lines.push(line(`row ${i}`, 72, 500 - i * 7, 451))
    expectSingle(lines)
  })

  it('needs a gutter wider than a stretched word space', () => {
    // 10pt of white space between two 90pt columns is a word space, not a gutter.
    const lines = [...column('L', 72, 780, 20, 211), ...column('R', 293, 780, 20, 211)]
    expectSingle(lines)
  })

  it('leaves a table of contents alone', () => {
    // Titles in a wide column, page numbers in a sliver: not two text columns.
    const titles = Array.from({ length: 10 }, (_, i) => line(`Chapter ${i}`, 72, 780 - i * 16, 328))
    const numbers = Array.from({ length: 10 }, (_, i) => line(`${i + 1}`, 500, 780 - i * 16, 20))
    expectSingle([...titles, ...numbers])
  })

  it('never reads a right column out of a ragged right edge', () => {
    // Ragged right on a single-column page: every line starts at 72 and stops
    // where its words run out, so the white space right of the short lines
    // looks like a gutter with a handful of long lines beyond it. Nothing
    // starts on the far side of that band, so it is not a column.
    const short = Array.from({ length: 18 }, (_, i) => line(`short line ${i}`, 72, 780 - i * 16, 230 + (i % 3) * 20))
    const wide = Array.from({ length: 8 }, (_, i) => line(`wide line ${i}`, 72, 772 - i * 16, 440 + i * 15))
    expectSingle([...short, line('almost wide', 72, 400, 300), ...wide])
  })
})
