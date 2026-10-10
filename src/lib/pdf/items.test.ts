import { describe, expect, it } from 'vitest'
import { runsFromPdfItems } from './items'

describe('runsFromPdfItems', () => {
  it('maps pdf.js transform into x/y/w/h', () => {
    const runs = runsFromPdfItems([
      { str: '甚', width: 12, transform: [12, 0, 0, 12, 100, 500] },
      { str: '', width: 0, transform: [12, 0, 0, 12, 0, 0] },
    ])
    expect(runs).toEqual([{ str: '甚', x: 100, y: 500, w: 12, h: 12 }])
  })

  it('normalizes PingFang radical forms in item strings', () => {
    const runs = runsFromPdfItems([{ str: '⻓期', width: 24, transform: [12, 0, 0, 12, 0, 0] }])
    expect(runs[0]?.str).toBe('长期')
  })
})
