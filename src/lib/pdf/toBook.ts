import { detectScript } from '../translate/lang'
import { restyleDocument } from '../typeset'
import { clusterLines, linesToHtml, type PdfLine, type PdfRun } from './cluster'
import { stripRepeatedMargins } from './headers'
import { makeEpubBlob } from './epubZip'
import type { PdfFigure } from './figures'
import type { PdfOutlineItem } from './outline'

const PAGES_PER_CHAPTER = 8

export function pagesToChapters(
  pages: PdfRun[][],
  heights: number[],
  bookTitle: string,
  chapterStarts?: number[],
  outline?: PdfOutlineItem[],
  figures?: PdfFigure[][],
): Array<{ title: string; html: string }> {
  const linePages = pages.map((runs) => clusterLines(runs))
  const cleaned = stripRepeatedMargins(linePages, heights)
  const sample = cleaned.flat().map((l) => l.text).join('').slice(0, 2000)
  const lang = detectScript(sample) === 'en' ? 'en' : 'zh'
  const starts = chapterStarts ?? outline?.map((item) => item.pageIndex)
  const ranges = pageRanges(cleaned.length, starts)
  const titled = new Map((outline ?? []).map((item) => [item.pageIndex, item.title]))
  const chapters: Array<{ title: string; html: string }> = []
  ranges.forEach(([from, to]) => {
    const html = restyleHtml(
      cleaned.slice(from, to).map((lines, index) => pageBody(lines, figures?.[from + index] ?? [])).join(''),
      lang,
    )
    if (!html.replace(/<[^>]+>/g, '').trim() && !html.includes('<img ')) return
    const label = titled.get(from)?.trim() || `${bookTitle} ${chapters.length + 1}`
    chapters.push({ title: label, html })
  })
  return chapters.length ? chapters : [{ title: bookTitle, html: '<p></p>' }]
}

export function pdfDisplayTitle(metaTitle: string, fileName: string): string {
  const trimmed = metaTitle.trim()
  if (!trimmed || /^(pdf export|untitled)$/i.test(trimmed)) {
    return fileName.replace(/\.pdf$/i, '').trim() || 'PDF'
  }
  return trimmed
}

export function pdfDisplayAuthor(metaAuthor: string): string {
  const trimmed = metaAuthor.trim()
  return trimmed || '未知作者'
}

export function pdfToEpubFile(input: {
  title: string
  author: string
  language: string
  pages: PdfRun[][]
  heights: number[]
  chapterStarts?: number[]
  outline?: PdfOutlineItem[]
  figures?: PdfFigure[][]
}): File {
  const chapters = pagesToChapters(
    input.pages,
    input.heights,
    input.title,
    input.chapterStarts,
    input.outline,
    input.figures,
  )
  const blob = makeEpubBlob({
    title: input.title,
    author: input.author,
    language: input.language,
    chapters,
    images: usedFigures(chapters, input.figures ?? []),
  })
  return new File([blob], `${input.title}.epub`, { type: 'application/epub+zip' })
}

function pageRanges(pageCount: number, starts?: number[]): Array<[number, number]> {
  if (!starts?.length) {
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < pageCount; i += PAGES_PER_CHAPTER) {
      ranges.push([i, Math.min(pageCount, i + PAGES_PER_CHAPTER)])
    }
    return ranges
  }
  const marks = [...new Set(starts.filter((i) => i >= 0 && i < pageCount))].sort((a, b) => a - b)
  if (marks[0] !== 0) marks.unshift(0)
  const ranges: Array<[number, number]> = []
  for (let i = 0; i < marks.length; i += 1) {
    const from = marks[i]
    const to = marks[i + 1] ?? pageCount
    if (to > from) ranges.push([from, to])
  }
  return ranges
}

function pageBody(lines: PdfLine[], figures: PdfFigure[]): string {
  const parts = [
    ...lines.map((line) => ({ y: line.y, html: linesToHtml([line]), image: false })),
    ...figures.map((figure) => ({ y: figure.top, html: `<img src="${figure.name}" alt=""/>`, image: true })),
  ]
  parts.sort((a, b) => b.y - a.y || Number(b.image) - Number(a.image))
  return parts.map((part) => part.html).join('')
}

function usedFigures(
  chapters: Array<{ html: string }>,
  pages: PdfFigure[][],
): Array<{ name: string; bytes: Uint8Array }> {
  const html = chapters.map((chapter) => chapter.html).join('')
  const used: Array<{ name: string; bytes: Uint8Array }> = []
  for (const figure of pages.flat()) {
    if (html.includes(`src="${figure.name}"`)) used.push({ name: figure.name, bytes: figure.bytes })
  }
  return used
}

function restyleHtml(html: string, lang: 'en' | 'zh'): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  restyleDocument(doc, lang)
  return doc.body.innerHTML
}
