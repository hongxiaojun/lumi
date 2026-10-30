import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { makeBook } from 'foliate-js/view.js'
import { convertPdf } from '../importBook'
import { classifyPdf, pdfRejectReason } from './classify'
import { extractPdf, setPdfAssetUrls, setPdfWorkerSrc } from './extract'
import { pagesToChapters } from './toBook'

const files = (process.env.PDF_QA ?? '').split('\n').filter(Boolean)

describe.skipIf(!files.length)('real PDF pipeline', () => {
  it('extracts, classifies, and restyles sample books', { timeout: 180_000 }, async () => {
    const req = createRequire(import.meta.url)
    const pkg = path.dirname(req.resolve('pdfjs-dist/package.json'))
    setPdfWorkerSrc(pathToFileURL(req.resolve('pdfjs-dist/build/pdf.worker.min.mjs')).href)
    setPdfAssetUrls({
      cMapUrl: `${pathToFileURL(path.join(pkg, 'cmaps')).href}/`,
      standardFontDataUrl: `${pathToFileURL(path.join(pkg, 'standard_fonts')).href}/`,
    })
    for (const file of files) {
      const extracted = await extractPdf(readFileSync(file))
      const kind = classifyPdf(extracted)
      const reason = pdfRejectReason(kind)
      const chapters = reason
        ? []
        : pagesToChapters(
            extracted.pages,
            extracted.heights,
            extracted.title || 'PDF',
            extracted.chapterStarts,
            extracted.outline,
            extracted.images,
          )
      const sample = chapters[0]?.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) ?? ''
      const radicals = /[\u2E80-\u2EF3\u2F00-\u2FD5]/.test(chapters.map((c) => c.html).join(''))
      let opened = ''
      if (kind === 'text') {
        const epub = await convertPdf(new File([readFileSync(file)], path.basename(file), { type: 'application/pdf' }))
        const book = (await makeBook(epub)) as {
          sections?: Array<{ createDocument?: () => Promise<Document> }>
          destroy?: () => void
        }
        try {
          const doc = await book.sections?.[0]?.createDocument?.()
          opened = (doc?.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
        } finally {
          book.destroy?.()
        }
      }
      console.log(
        JSON.stringify({
          file: path.basename(file),
          title: extracted.title,
          author: extracted.author,
          pages: extracted.pageCount,
          chars: extracted.charCount,
          kind,
          reason,
          chapters: chapters.length,
          starts: extracted.chapterStarts.slice(0, 10),
          radicals,
          sample,
          opened,
        }),
      )
      expect(kind === 'text' || kind === 'scanned' || kind === 'encrypted').toBe(true)
      if (kind === 'text') {
        expect(radicals).toBe(false)
        expect(opened.length).toBeGreaterThan(20)
      }
    }
  })
})
