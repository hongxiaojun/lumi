import { invoke } from '@tauri-apps/api/core'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfRun } from './cluster'

/** One recognized line as the Rust Vision command returns it: text plus a
 * normalized bounding box with Vision's bottom-left origin. */
export type OcrLine = {
  text: string
  x: number
  y: number
  w: number
  h: number
}

/** Vision boxes already measure y from the page bottom, like pdf.js baseline
 * y, so mapping is a plain rescale. Top lines end up with the larger y that
 * clusterLines expects. */
export function ocrRunsFromLines(lines: OcrLine[], pageW: number, pageH: number): PdfRun[] {
  const runs: PdfRun[] = []
  for (const item of lines) {
    const str = (item.text ?? '').trim()
    if (!str) continue
    runs.push({
      str,
      x: item.x * pageW,
      y: item.y * pageH,
      w: item.w * pageW,
      h: Math.max(item.h * pageH, 1),
    })
  }
  return runs
}

export function ocrSupported(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Render target: about 150dpi, the level the Vision prototype was tuned at. */
const RENDER_SCALE = 2
const MAX_RENDER_PIXELS = 16_000_000

/** Renders one PDF page and OCRs it on this Mac. Returns null when the page
 * could not be rendered or recognized, so the caller keeps the text layer. */
export async function ocrPdfPage(page: PDFPageProxy): Promise<PdfRun[] | null> {
  try {
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(RENDER_SCALE, Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height)))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return null
    await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height)
    // A fresh buffer: getImageData reuses its own, and IPC must own its bytes.
    const pixels = new Uint8Array(rgba.data.buffer.slice(0))
    const lines = (await invoke('ocr_page', pixels, {
      headers: {
        'x-page-width': String(canvas.width),
        'x-page-height': String(canvas.height),
      },
    })) as OcrLine[]
    if (!Array.isArray(lines)) return null
    return ocrRunsFromLines(lines, base.width, base.height)
  } catch {
    return null
  }
}
