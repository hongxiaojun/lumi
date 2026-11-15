import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { makeBook } from 'foliate-js/view.js'
import { convertPdf } from '../importBook'
import { classifyPdf, pdfRejectReason } from './classify'
import { clusterLines } from './cluster'
import { extractPdf, setPdfAssetUrls, setPdfWorkerSrc } from './extract'
import { orderPageLines } from './layout'
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
            { widths: extracted.widths },
          )
      // Pages whose reading order differs from plain top-to-bottom: the column
      // detector fires on these. Single-column books must report zero.
      const pages = extracted.pages.map((runs, index) => {
        const lines = clusterLines(runs)
        const ordered = orderPageLines(lines, {
          width: extracted.widths[index] ?? 0,
          height: extracted.heights[index] ?? 0,
        })
        return { lines, ordered }
      })
      const reordered = pages.filter((page) => page.ordered !== page.lines).length
      // The first page whose order the detector changed, in reading order and
      // in the plain top-to-bottom order the old pipeline used: on a two-column
      // paper the first reads as prose, the second jumps columns every line.
      const at = pages.findIndex((page) => page.ordered !== page.lines)
      const pick = pages[at >= 0 ? at : Math.floor(pages.length / 2)] ?? { lines: [], ordered: [] }
      const head = (lines: typeof pick.lines) => lines.slice(0, 6).map((line) => line.text).join(' ')
      const midOrdered = head(pick.ordered)
      const midRaw = head(pick.lines)
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
          reordered,
          midOrdered,
          midRaw,
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
