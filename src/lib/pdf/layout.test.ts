import { describe, expect, it } from 'vitest'

import type { PdfLine } from './cluster'
import { detectColumns, orderPageLines, type PageBox } from './layout'

/** A4 at 72 dpi, the shape of nearly every book PDF we care about. */
const PAGE: PageBox = { width: 595, height: 842 }

function line(text: string, x0: number, y: number, w: number, h = 12): PdfLine {
  return { text, x0, x1: x0 + w, y, h }
}

/** A full column of body lines, top to bottom, one per baseline step. */
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

const texts = (lines: PdfLine[]): string[] => lines.map((l) => l.text)

describe('orderPageLines', () => {
  it('returns the very same array for a single column', () => {
    const lines = column('B', 72, 780, 20, 451)
    // toBe, not toEqual: callers rely on the identity to skip downstream work.
    expect(orderPageLines(lines, PAGE)).toBe(lines)
    expect(detectColumns(lines, PAGE)).toBeNull()
  })

  it('reads a two-column page left column first', () => {
    const left = column('L', 72, 780, 20, 211)
    const right = column('R', 311, 780, 20, 212)
    const out = orderPageLines([...right, ...left], PAGE)

    expect(texts(out)).toEqual([...texts(left), ...texts(right)])
  })

  it('keeps a short right column after the whole of a long left one', () => {
    const left = column('L', 72, 780, 12, 211)
    const right = column('R', 311, 780, 4, 212)
    const out = orderPageLines([...left, ...right], PAGE)

    expect(texts(out)).toEqual([...texts(left), ...texts(right)])
  })

  it('reads three columns left to right', () => {
    const a = column('A', 72, 780, 8, 136)
    const b = column('B', 240, 780, 8, 136)
    const c = column('C', 408, 780, 8, 136)
    const out = orderPageLines([...c, ...a, ...b], PAGE)

    expect(texts(out)).toEqual([...texts(a), ...texts(b), ...texts(c)])
  })

  it('keeps a full-width headline in front of both columns, once', () => {
    const head = line('Headline', 72, 800, 451)
    const left = column('L', 72, 780, 16, 211)
    const right = column('R', 311, 780, 16, 212)
    const out = orderPageLines([...right, head, ...left], PAGE)

    expect(texts(out)[0]).toBe('Headline')
    expect(texts(out).filter((t) => t === 'Headline')).toHaveLength(1)
    expect(texts(out).slice(1)).toEqual([...texts(left), ...texts(right)])
  })

  it('anchors a spanning row inside its own band', () => {
    // A full-width table row between two halves of a two-column article.
    const head = line('Headline', 72, 800, 451)
    const topL = column('TL', 72, 780, 5, 211)
    const topR = column('TR', 311, 780, 5, 212)
    const row = line('Spanning row', 72, 710, 451)
    const botL = column('BL', 72, 696, 5, 211)
    const botR = column('BR', 311, 696, 5, 212)
    const out = orderPageLines([...botR, ...topR, row, ...botL, ...topL, head], PAGE)

    expect(texts(out)).toEqual([
      'Headline',
      ...texts(topL),
      ...texts(topR),
      'Spanning row',
      ...texts(botL),
      ...texts(botR),
    ])
  })

  it('finds an off-centre 60/35 gutter', () => {
    const left = column('L', 72, 780, 20, 271)
    const right = column('R', 371, 780, 20, 152)
    const out = orderPageLines([...right, ...left], PAGE)

    expect(texts(out)).toEqual([...texts(left), ...texts(right)])
  })

  it('is idempotent', () => {
    const head = line('Headline', 72, 800, 451)
    const left = column('L', 72, 780, 16, 211)
    const right = column('R', 311, 780, 16, 212)
    const once = orderPageLines([...right, head, ...left], PAGE)

    expect(texts(orderPageLines(once, PAGE))).toEqual(texts(once))
  })

  it('ignores the page height', () => {
    const left = column('L', 72, 780, 20, 211)
    const right = column('R', 311, 780, 20, 212)
    const input = [...right, ...left]
    const plain = texts(orderPageLines(input, PAGE))
    const tall = texts(orderPageLines(input, { width: 595, height: 1000 }))

    expect(tall).toEqual(plain)
  })

  it('only reorders — never drops or duplicates a line', () => {
    const head = line('Headline', 72, 800, 451)
    const left = column('L', 72, 780, 16, 211)
    const right = column('R', 311, 780, 16, 212)
    const input = [...right, head, ...left]
    const out = orderPageLines(input, PAGE)

    expect(texts(out).sort()).toEqual(texts(input).sort())
  })
})

describe('detectColumns', () => {
  it('returns leaves in left-to-right order', () => {
    const left = column('L', 72, 780, 20, 211)
    const right = column('R', 311, 780, 20, 212)
    const leaves = detectColumns([...right, ...left], PAGE)

    expect(leaves?.map((leaf) => leaf[0].text)).toEqual(['L0', 'R0'])
  })
})
