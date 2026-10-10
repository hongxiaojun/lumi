export type PdfClass = 'text' | 'scanned' | 'encrypted'

export function classifyPdf(input: {
  encrypted: boolean
  charCount: number
  pageCount: number
  sparsePages?: number
}): PdfClass {
  if (input.encrypted) return 'encrypted'
  const pages = Math.max(1, input.pageCount)
  if (input.charCount === 0) return 'scanned'
  if (pages >= 3 && input.charCount / pages < 12) return 'scanned'
  if (pages >= 10 && input.charCount / pages < 40) return 'scanned'
  if (pages >= 10 && (input.sparsePages ?? 0) / pages >= 0.7) return 'scanned'
  return 'text'
}

export function pdfRejectReason(kind: PdfClass): string | null {
  if (kind === 'encrypted') return '这本 PDF 有密码，Lumi 打不开'
  if (kind === 'scanned') return '这是扫描版 PDF，没有文字层，暂时不能重排'
  return null
}
