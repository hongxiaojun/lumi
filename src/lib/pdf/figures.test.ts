import { describe, expect, it } from 'vitest'
import { figureBox, figuresFromOps, jpegSources, type JpegSource } from './figures'

function jpegDict(width: number, height: number, payload: number[]): Uint8Array {
  const jpeg = new Uint8Array(payload)
  const head = new TextEncoder().encode(
    `9 0 obj<</Length ${jpeg.length}/Type/XObject/Subtype/Image/Filter/DCTDecode/Width ${width}/Height ${height}>>stream\n`,
  )
  const tail = new TextEncoder().encode('\nendstream\nendobj\n')
  const out = new Uint8Array(head.length + jpeg.length + tail.length)
  out.set(head, 0)
  out.set(jpeg, head.length)
  out.set(tail, head.length + jpeg.length)
  return out
}

describe('jpegSources', () => {
  it('reads the JPEG bytes declared on an image object', () => {
    const pdf = jpegDict(32, 24, [0xff, 0xd8, 0x11, 0x22, 0xff, 0xd9])
    const found = jpegSources(pdf)
    expect(found).toHaveLength(1)
    expect(found[0].width).toBe(32)
    expect(found[0].height).toBe(24)
    expect([...found[0].bytes]).toEqual([0xff, 0xd8, 0x11, 0x22, 0xff, 0xd9])
  })

  it('ignores a DCT word that is not an image', () => {
    const noise = new TextEncoder().encode('hello DCTDecode world')
    expect(jpegSources(noise)).toEqual([])
  })
})

describe('figuresFromOps', () => {
  const pool = (): JpegSource[] => [
    { width: 8, height: 8, bytes: new Uint8Array([0xff, 0xd8, 1]) },
    { width: 8, height: 8, bytes: new Uint8Array([0xff, 0xd8, 2]) },
  ]

  it('places a figure by the top of its box and skips a tiny one', () => {
    const fn = [10, 12, 85, 11, 10, 12, 85, 11]
    const args = [
      [],
      [100, 0, 0, 80, 40, 100],
      ['Im1'],
      [],
      [],
      [10, 0, 0, 10, 0, 0],
      ['Im2'],
      [],
    ]
    const found = figuresFromOps(fn, args, () => ({ width: 8, height: 8 }), pool(), 0)
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('img/p001-1.jpg')
    expect(found[0].top).toBe(180)
    expect([...found[0].bytes]).toEqual([0xff, 0xd8, 1])
  })

  it('reuses one JPEG when the same pixels are painted twice', () => {
    const fn = [12, 85, 11, 12, 85]
    const args = [
      [80, 0, 0, 60, 10, 200],
      ['Im1'],
      [],
      [90, 0, 0, 70, 10, 40],
      ['Im1'],
    ]
    const sources: JpegSource[] = [{ width: 8, height: 8, bytes: new Uint8Array([0xff, 0xd8, 7]) }]
    const found = figuresFromOps(fn, args, () => ({ width: 8, height: 8 }), sources, 2)
    expect(found.map((item) => item.name)).toEqual(['img/p003-1.jpg', 'img/p003-2.jpg'])
    expect([...found[1].bytes]).toEqual([0xff, 0xd8, 7])
  })
})

describe('figureBox', () => {
  it('uses the top edge in PDF coordinates', () => {
    expect(figureBox([100, 0, 0, 80, 40, 100])).toEqual({ top: 180, w: 100, h: 80 })
  })
})
