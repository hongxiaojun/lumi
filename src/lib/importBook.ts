import { makeBook } from 'foliate-js/view.js'
import type { LibraryBook, TocItem } from '../types'
import { formatAuthor, formatLangMap } from './format'
import { listBooks, putBook } from './db'
import { detectBookLanguage } from './typeset'
import { buildAndPersist } from './aiDb/build'
import { sniffFormat } from './pdf/sniff'
import { extractPdf } from './pdf/extract'
import { garbledRatio } from './pdf/garbled'
import { ocrPdfPage, ocrSupported } from './pdf/ocr'
import { classifyPdf, pdfRejectReason } from './pdf/classify'
import { pdfDisplayAuthor, pdfDisplayTitle, pdfToEpubFile } from './pdf/toBook'
import { explainImportFailure, guardEpub } from './importError'
import { randomId } from './id'
import { sectionFraction } from './parseGate'

export type ImportHooks = {
  onFile?: (name: string, fraction: number) => void
  onBook?: (book: LibraryBook, fraction: number) => void
}

type FoliateBook = {
  metadata?: {
    title?: string | Record<string, string>
    creator?: unknown
    author?: unknown
    language?: unknown
  }
  toc?: TocItem[]
  sections?: Array<{
    linear?: string
    id?: string
    createDocument?: () => Promise<Document>
  }>
  getCover?: () => Promise<Blob | null>
  destroy?: () => void
}

export async function importPrepared(
  file: File,
  persist: (book: LibraryBook, foliate: FoliateBook) => Promise<LibraryBook>,
  id?: string,
  hooks?: ImportHooks,
): Promise<LibraryBook> {
  let foliate: FoliateBook | undefined
  const sourceName = file.name
  try {
    if (!file.size) throw new Error('这个文件是空的')
    hooks?.onFile?.(sourceName, 0.05)
    await guardEpub(file)
    const kind = sniffFormat(new Uint8Array(await file.slice(0, 8).arrayBuffer()))
    if (kind === 'pdf') {
      file = await convertPdf(file, (done, total) => {
        const ratio = total > 0 ? Math.min(1, done / total) : 0
        hooks?.onFile?.(sourceName, 0.05 + 0.3 * ratio)
      })
    }
    foliate = (await makeBook(file)) as FoliateBook
    const title = formatLangMap(foliate.metadata?.title) || file.name.replace(/\.[^.]+$/, '')
    const author =
      formatAuthor(foliate.metadata?.author as never) ||
      formatAuthor(foliate.metadata?.creator as never) ||
      '未知作者'
    const cover = (await foliate.getCover?.()) ?? null
    const language = detectBookLanguage(foliate.metadata?.language, await sampleText(foliate))
    const book: LibraryBook = {
      id: id ?? randomId(),
      title,
      author,
      fileName: file.name,
      file,
      cover,
      addedAt: Date.now(),
      lastOpenedAt: null,
      cfi: null,
      fraction: 0,
      language,
    }
    return await persist(book, foliate)
  } catch (error) {
    throw new Error(explainImportFailure(error))
  } finally {
    foliate?.destroy?.()
  }
}

export async function importFile(file: File, hooks?: ImportHooks): Promise<LibraryBook> {
  return importPrepared(
    file,
    async (book, foliate) => {
      await putBook(book)
      hooks?.onBook?.(book, 0.4)
      try {
        const rows = await listBooks()
        const next = await buildAndPersist(foliate, book, rows, (done, total) => {
          hooks?.onBook?.(book, sectionFraction(done, total))
        })
        await putBook(next)
        hooks?.onBook?.(next, 1)
        return next
      } catch {
        hooks?.onBook?.(book, 1)
        return book
      }
    },
    undefined,
    hooks,
  )
}

export async function importMany(files: Iterable<File>, hooks?: ImportHooks): Promise<string[]> {
  const errors: string[] = []
  for (const file of files) {
    try {
      await importFile(file, hooks)
    } catch (error) {
      errors.push(`${file.name}：${explainImportFailure(error)}`)
    }
  }
  return errors
}

export async function convertPdf(
  file: File,
  onPage?: (done: number, total: number) => void,
): Promise<File> {
  // Pages with a missing or garbled text layer go through Vision OCR on this Mac.
  const ocrPage = ocrSupported() ? ocrPdfPage : undefined
  const extracted = await extractPdf(await file.arrayBuffer(), { onPage, ocrPage })
  const sample = extracted.pages.flat().map((run) => run.str).join('').slice(0, 4000)
  const reason = pdfRejectReason(classifyPdf({ ...extracted, garbledRatio: garbledRatio(sample) }))
  if (reason) throw new Error(reason)
  const language = detectBookLanguage(undefined, sample) === 'en' ? 'en' : 'zh'
  const title = pdfDisplayTitle(extracted.title, file.name)
  return pdfToEpubFile({
    title,
    author: pdfDisplayAuthor(extracted.author),
    language,
    pages: extracted.pages,
    heights: extracted.heights,
    chapterStarts: extracted.chapterStarts,
    outline: extracted.outline,
    figures: extracted.images,
  })
}

async function sampleText(book: FoliateBook): Promise<string> {
  const section =
    book.sections?.find((item) => item.linear !== 'no' && item.createDocument) ??
    book.sections?.find((item) => item.createDocument)
  if (!section?.createDocument) return ''
  try {
    const doc = await section.createDocument()
    return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 2500)
  } catch {
    return ''
  }
}

export async function seedSampleIfEmpty(existingCount: number): Promise<LibraryBook | null> {
  if (existingCount > 0) return null
  if (localStorage.getItem('leaf:seeded')) return null
  localStorage.setItem('leaf:seeded', '1')
  try {
    const res = await fetch('/samples/leaf-sample.epub')
    if (!res.ok) return null
    const blob = await res.blob()
    const file = new File([blob], '叶读试读.epub', { type: 'application/epub+zip' })
    return await importFile(file)
  } catch {
    // The sample is optional. A packaged webview may not serve it.
    return null
  }
}
