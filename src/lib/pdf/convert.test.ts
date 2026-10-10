import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeBook } from 'foliate-js/view.js'
import { convertPdf } from '../importBook'
import { setPdfAssetUrls, setPdfWorkerSrc } from './extract'
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

describe('convertPdf', () => {
  it('turns a text PDF into an EPUB foliate can open', async () => {
    const epub = await convertPdf(new File([helloPdfBytes() as BlobPart], 'hello.pdf', { type: 'application/pdf' }))
    expect(epub.name).toMatch(/\.epub$/)
    const book = (await makeBook(epub)) as {
      metadata?: { title?: string }
      sections?: Array<{ createDocument?: () => Promise<Document> }>
      destroy?: () => void
    }
    try {
      expect(String(book.metadata?.title ?? '')).toMatch(/Hello|hello/i)
      const doc = await book.sections?.[0]?.createDocument?.()
      expect(doc?.body?.textContent ?? '').toMatch(/Hello/)
    } finally {
      book.destroy?.()
    }
  })

  it('rejects a password PDF with the M1 message', async () => {
    const file = new File([encryptedPdfBytes() as BlobPart], 'secret.pdf', { type: 'application/pdf' })
    await expect(convertPdf(file)).rejects.toThrow(/密码/)
  })

  it('rejects a scanned PDF with the M1 message', async () => {
    const file = new File([blankPdfBytes() as BlobPart], 'scan.pdf', { type: 'application/pdf' })
    await expect(convertPdf(file)).rejects.toThrow(/扫描/)
  })
})
