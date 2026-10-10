import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { classifyPdf, pdfRejectReason } from './classify'
import { extractPdf, setPdfAssetUrls, setPdfWorkerSrc } from './extract'
import { blankPdfBytes, encryptedPdfBytes, helloPdfBytes } from './helloPdf'

beforeAll(() => {
  const req = createRequire(import.meta.url)
  const pkg = path.dirname(req.resolve('pdfjs-dist/package.json'))
  setPdfWorkerSrc(pathToFileURL(req.resolve('pdfjs-dist/build/pdf.worker.min.mjs')).href)
  setPdfAssetUrls({
    cMapUrl: `${pathToFileURL(path.join(pkg, 'cmaps')).href}/`,
    standardFontDataUrl: `${pathToFileURL(path.join(pkg, 'standard_fonts')).href}/`,
  })
})

describe('extractPdf', () => {
  it('reads text from a tiny PDF', async () => {
    const out = await extractPdf(helloPdfBytes())
    expect(out.encrypted).toBe(false)
    expect(out.pageCount).toBe(1)
    expect(out.charCount).toBeGreaterThan(4)
    const joined = out.pages.flat().map((r) => r.str).join('')
    expect(joined).toMatch(/Hello/)
    expect(classifyPdf(out)).toBe('text')
    expect(pdfRejectReason(classifyPdf(out))).toBeNull()
  })

  it('classifies a page with no text as scanned', async () => {
    const out = await extractPdf(blankPdfBytes())
    expect(out.encrypted).toBe(false)
    expect(out.charCount).toBe(0)
    expect(classifyPdf(out)).toBe('scanned')
    expect(pdfRejectReason(classifyPdf(out))).toMatch(/扫描/)
  })

  it('classifies a password PDF as encrypted', async () => {
    const out = await extractPdf(encryptedPdfBytes())
    expect(out.encrypted).toBe(true)
    expect(classifyPdf(out)).toBe('encrypted')
    expect(pdfRejectReason(classifyPdf(out))).toMatch(/密码/)
  })
})

