import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { classifyPdf, pdfRejectReason } from './classify'
import { extractPdf, pageNeedsOcr, setPdfAssetUrls, setPdfWorkerSrc } from './extract'
import { installStreamAsyncIterator } from './polyfill'
import { blankPdfBytes, encryptedPdfBytes, helloPdfBytes } from './helloPdf'
import type { PdfRun } from './cluster'

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
    const seen: Array<[number, number]> = []
    const out = await extractPdf(helloPdfBytes(), (done, total) => seen.push([done, total]))
    expect(out.encrypted).toBe(false)
    expect(out.pageCount).toBe(1)
    expect(out.charCount).toBeGreaterThan(4)
    const joined = out.pages.flat().map((r) => r.str).join('')
    expect(joined).toMatch(/Hello/)
    expect(seen).toEqual([[1, 1]])
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

  it('OCRs pages with no text layer and keeps the recognized runs', async () => {
    const ocrRuns: PdfRun[] = [
      { str: '扫描出来的一行正文文字', x: 72, y: 700, w: 300, h: 16 },
      { str: '第二行也有足够多的字', x: 72, y: 660, w: 120, h: 16 },
    ]
    const ocrPage = vi.fn(async () => ocrRuns)
    const out = await extractPdf(blankPdfBytes(), { ocrPage })
    expect(ocrPage).toHaveBeenCalledTimes(1)
    expect(ocrPage.mock.calls[0][1]).toBe(0)
    expect(out.charCount).toBeGreaterThan(12)
    const joined = out.pages.flat().map((r) => r.str).join('')
    expect(joined).toMatch(/扫描出来/)
    expect(classifyPdf(out)).toBe('text')
    expect(pdfRejectReason(classifyPdf(out))).toBeNull()
  })

  it('keeps the text layer when OCR fails, even on a sparse page', async () => {
    const ocrPage = vi.fn(async () => null)
    const out = await extractPdf(helloPdfBytes(), { ocrPage })
    expect(ocrPage).toHaveBeenCalledTimes(1)
    expect(out.charCount).toBeGreaterThan(4)
    const joined = out.pages.flat().map((r) => r.str).join('')
    expect(joined).toMatch(/Hello/)
  })
})

describe('pageNeedsOcr', () => {
  it('flags a page with no usable text', () => {
    expect(pageNeedsOcr([])).toBe(true)
    expect(pageNeedsOcr([{ str: '目录', x: 0, y: 0, w: 10, h: 10 }])).toBe(true)
  })

  it('flags a page whose text is the known garbled mapping', () => {
    const garbled = '餓⟣綘鳓\uf63b桬䚃日խFEJUPST!IVBORJVLFYVF\x0fDPN㼭ꥬ㹔ⰻ\ue67b鵯⚡㼭ꥬ㹔⠔鄄⺫醙㖈♧⚡⥂䫡䚍㢪邆⚥'
    const runs: PdfRun[] = [{ str: garbled, x: 0, y: 0, w: 100, h: 10 }]
    expect(pageNeedsOcr(runs)).toBe(true)
  })

  it('keeps a clean page', () => {
    const runs: PdfRun[] = [
      { str: '时间反演对称性可以被打破，而这种看似突兀的皱纹也给了我们一个认识物理世界的窗口。', x: 0, y: 0, w: 100, h: 10 },
    ]
    expect(pageNeedsOcr(runs)).toBe(false)
  })
})

/** iPad and iPhone run WebKit, which has no Symbol.asyncIterator on
 * ReadableStream. pdf.js reads text with `for await`, so this is the shape the
 * iPad hit: "这本书打不开（TypeError: undefined is not a function）" on the
 * first page of every PDF. */
describe('extractPdf without ReadableStream async iteration', () => {
  const proto = ReadableStream.prototype as Record<symbol, unknown>
  const KEY = Symbol.asyncIterator
  const native = proto[KEY]

  afterEach(() => {
    Object.defineProperty(proto, KEY, { configurable: true, writable: true, value: native })
  })

  it('fails on getTextContent, then reads the page once the stream iterator is installed', async () => {
    Reflect.deleteProperty(proto, KEY)
    await expect(extractPdf(helloPdfBytes())).rejects.toThrow(/not async iterable|is not a function/)

    installStreamAsyncIterator(ReadableStream)
    const out = await extractPdf(helloPdfBytes())
    expect(out.pageCount).toBe(1)
    expect(out.pages.flat().map((r) => r.str).join('')).toMatch(/Hello/)
  })
})


