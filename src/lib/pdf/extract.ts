import './polyfill'
import { getDocument, GlobalWorkerOptions, PasswordException } from 'pdfjs-dist/build/pdf.mjs'
import type { PdfRun } from './cluster'
import { runsFromPdfItems } from './items'
import { outlineFromPdf, type PdfOutlineItem } from './outline'

let workerReady = false
let assets = {
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
}

export function setPdfWorkerSrc(src: string): void {
  GlobalWorkerOptions.workerSrc = src
  workerReady = true
}

export function setPdfAssetUrls(next: Partial<typeof assets>): void {
  assets = { ...assets, ...next }
}

async function ensureWorker(): Promise<void> {
  if (workerReady) return
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  GlobalWorkerOptions.workerSrc = worker.default as string
  workerReady = true
}

export type PdfExtract = {
  pages: PdfRun[][]
  heights: number[]
  charCount: number
  pageCount: number
  encrypted: boolean
  title: string
  author: string
  chapterStarts: number[]
  outline: PdfOutlineItem[]
  sparsePages: number
}

export async function extractPdf(data: Uint8Array | ArrayBuffer): Promise<PdfExtract> {
  await ensureWorker()
  const bytes = copyBytes(data)
  try {
    const task = getDocument({
      data: bytes,
      isEvalSupported: false,
      useSystemFonts: true,
      cMapUrl: assets.cMapUrl,
      cMapPacked: true,
      standardFontDataUrl: assets.standardFontDataUrl,
    })
    const pdf = await task.promise
    const pages: PdfRun[][] = []
    const heights: number[] = []
    let charCount = 0
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      heights.push(viewport.height)
      const content = await page.getTextContent()
      const runs = runsFromPdfItems(content.items as Array<{ str?: string; width?: number; transform?: number[] }>)
      charCount += runs.reduce((n, r) => n + r.str.replace(/\s+/g, '').length, 0)
      pages.push(runs)
    }
    const meta = await pdf.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string; Creator?: string }
    const title = String(info.Title ?? '').trim()
    const author = String(info.Author || info.Creator || '').trim()
    const outline = await outlineFromPdf(pdf)
    const chapterStarts = outline.map((item) => item.pageIndex)
    const sparsePages = pages.filter(
      (runs) => runs.reduce((n, r) => n + r.str.replace(/\s+/g, '').length, 0) < 12,
    ).length
    const closer = pdf as { destroy?: () => void; cleanup?: () => void }
    closer.destroy?.()
    closer.cleanup?.()
    return {
      pages,
      heights,
      charCount,
      pageCount: pages.length,
      encrypted: false,
      title,
      author,
      chapterStarts,
      outline,
      sparsePages,
    }
  } catch (err) {
    if (err instanceof PasswordException || /password/i.test(String((err as Error)?.name) + (err as Error)?.message)) {
      return {
        pages: [],
        heights: [],
        charCount: 0,
        pageCount: 0,
        encrypted: true,
        title: '',
        author: '',
        chapterStarts: [],
        outline: [],
        sparsePages: 0,
      }
    }
    throw err
  }
}

function copyBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  const src = data instanceof Uint8Array ? data : new Uint8Array(data)
  const out = new Uint8Array(src.byteLength)
  out.set(src)
  return out
}
