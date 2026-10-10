import { describe, expect, it } from 'vitest'
import { classifyPdf, pdfRejectReason } from './classify'

describe('classifyPdf', () => {
  it('flags encryption before looking at text', () => {
    expect(classifyPdf({ encrypted: true, charCount: 9000, pageCount: 10 })).toBe('encrypted')
  })

  it('flags a scan with almost no extractable text', () => {
    expect(classifyPdf({ encrypted: false, charCount: 12, pageCount: 40 })).toBe('scanned')
    expect(classifyPdf({ encrypted: false, charCount: 0, pageCount: 1 })).toBe('scanned')
  })

  it('accepts a text-layer PDF', () => {
    expect(classifyPdf({ encrypted: false, charCount: 800, pageCount: 3 })).toBe('text')
  })

  it('flags a long image-heavy PDF with only a few characters per page', () => {
    expect(classifyPdf({ encrypted: false, charCount: 2268, pageCount: 126 })).toBe('scanned')
    expect(classifyPdf({ encrypted: false, charCount: 5000, pageCount: 40, sparsePages: 32 })).toBe(
      'scanned',
    )
  })
})

describe('pdfRejectReason', () => {
  it('explains encrypted and scanned files in Chinese', () => {
    expect(pdfRejectReason('encrypted')).toMatch(/密码/)
    expect(pdfRejectReason('scanned')).toMatch(/扫描/)
    expect(pdfRejectReason('text')).toBeNull()
  })
})
