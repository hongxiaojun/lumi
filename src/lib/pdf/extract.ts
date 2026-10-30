import './polyfill'
import { getDocument, GlobalWorkerOptions, PasswordException } from 'pdfjs-dist/build/pdf.mjs'
import type { PdfRun } from './cluster'
import { figuresFromOps, jpegSources, type PdfFigure } from './figures'
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
  images: PdfFigure[][]
}

export async function extractPdf(
  data: Uint8Array | ArrayBuffer,
  onPage?: (done: number, total: number) => void,
): Promise<PdfExtract> {
  await ensureWorker()
  const bytes = copyBytes(data)
  // pdf.js transfers this buffer to its worker, so the JPEG scan has to finish first.
  const pool = jpegSources(bytes)
  try {
    const task = getDocument({
      data: copyBytes(bytes),
      isEvalSupported: false,
      useSystemFonts: true,
      cMapUrl: assets.cMapUrl,
      cMapPacked: true,
      standardFontDataUrl: assets.standardFontDataUrl,
    })
    const pdf = await task.promise
    const pages: PdfRun[][] = []
    const heights: number[] = []
    const images: PdfFigure[][] = []
    let charCount = 0
    const total = pdf.numPages
    for (let i = 1; i <= total; i += 1) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      heights.push(viewport.height)
      const content = await page.getTextContent()
      const runs = runsFromPdfItems(content.items as Array<{ str?: string; width?: number; transform?: number[] }>)
      charCount += runs.reduce((n, r) => n + r.str.replace(/\s+/g, '').length, 0)
      pages.push(runs)
      images.push(await figuresForPage(page, pool, i - 1))
      onPage?.(i, total)
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
      images,
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
        images: [],
      }
    }
    throw err
  }
}

const PAINT = 85

async function figuresForPage(
  page: {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>
    objs: { get: (name: string, callback: (obj: { width?: number; height?: number } | null) => void) => void }
  },
  pool: ReturnType<typeof jpegSources>,
  pageIndex: number,
): Promise<PdfFigure[]> {
  try {
    const ops = await page.getOperatorList()
    const sizes = new Map<string, { width: number; height: number }>()
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      if (ops.fnArray[i] !== PAINT) continue
      const name = String(ops.argsArray[i]?.[0] ?? '')
      if (!name || sizes.has(name)) continue
      const obj = await new Promise<{ width?: number; height?: number } | null>((resolve) => page.objs.get(name, resolve))
      if (obj?.width && obj?.height) sizes.set(name, { width: obj.width, height: obj.height })
    }
    return figuresFromOps(ops.fnArray, ops.argsArray, (name) => sizes.get(name) ?? null, pool, pageIndex)
  } catch {
    return []
  }
}

function copyBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  const src = data instanceof Uint8Array ? data : new Uint8Array(data)
  const out = new Uint8Array(src.byteLength)
  out.set(src)
  return out
}
