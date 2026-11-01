import { describe, expect, it } from 'vitest'
import { ocrRunsFromLines, type OcrLine } from './ocr'

const line = (over: Partial<OcrLine>): OcrLine => ({
  text: '字',
  x: 0.1,
  y: 0.9,
  w: 0.5,
  h: 0.02,
  ...over,
})

describe('ocrRunsFromLines', () => {
  it('scales normalized boxes into point runs', () => {
    const runs = ocrRunsFromLines([line({ x: 0.25, y: 0.8, w: 0.5, h: 0.02 })], 612, 792)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toEqual({ str: '字', x: 153, y: 633.6, w: 306, h: 15.84 })
  })

  it('keeps Vision bottom-origin y so top lines sort first', () => {
    const top = line({ text: '上', y: 0.95 })
    const bottom = line({ text: '下', y: 0.2 })
    const runs = ocrRunsFromLines([bottom, top], 612, 792)
    expect(runs[0].str).toBe('下')
    expect(runs[1].str).toBe('上')
    expect(runs[1].y).toBeGreaterThan(runs[0].y)
  })

  it('drops empty lines and floors tiny heights', () => {
    const runs = ocrRunsFromLines(
      [line({ text: '' }), line({ text: '   ' }), line({ h: 0.0001 })],
      612,
      792,
    )
    expect(runs).toHaveLength(1)
    expect(runs[0].h).toBeGreaterThanOrEqual(1)
  })

  it('returns no runs for no lines', () => {
    expect(ocrRunsFromLines([], 612, 792)).toEqual([])
  })
})
