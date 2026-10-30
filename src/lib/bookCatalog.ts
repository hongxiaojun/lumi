import type { LibraryBook } from '../types'
import type { ScriptKind } from './translate/lang'

/** Identity stored beside the book file. Progress stays on this device. */
export type DiskBookMeta = {
  id: string
  title: string
  author: string
  fileName: string
  addedAt: number
  language?: ScriptKind
  aiSlug?: string
  aiBuiltAt?: number
}

export type CatalogRow = {
  id: string
  filePath: string
  meta: DiskBookMeta
}

const ID_OK = /^[A-Za-z0-9_-]{1,128}$/
const OPEN_EXTS = new Set(['epub', 'pdf', 'mobi', 'azw3', 'fb2'])

type Identity = {
  id: string
  title: string
  author: string
  fileName: string
  addedAt: number
  language?: ScriptKind
  aiSlug?: string
  aiBuiltAt?: number
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function scriptOf(value: unknown): ScriptKind | undefined {
  return value === 'zh' || value === 'en' || value === 'mixed' || value === 'other' ? value : undefined
}

function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

export function diskMetaOf(book: Identity): DiskBookMeta {
  const meta: DiskBookMeta = {
    id: book.id,
    title: book.title.trim() || '未命名',
    author: book.author.trim() || '未知作者',
    fileName: book.fileName,
    addedAt: book.addedAt,
  }
  const language = scriptOf(book.language)
  if (language) meta.language = language
  if (book.aiSlug) meta.aiSlug = book.aiSlug
  if (typeof book.aiBuiltAt === 'number' && Number.isFinite(book.aiBuiltAt)) meta.aiBuiltAt = book.aiBuiltAt
  return meta
}

/** First time the file is on disk, or the title / author / file name changed. Page turns do not. */
export function shouldWriteDiskMeta(existing: LibraryBook | undefined, next: LibraryBook): boolean {
  const path = next.filePath ?? existing?.filePath
  if (!path) return false
  if (!existing?.filePath) return true
  return JSON.stringify(diskMetaOf(existing)) !== JSON.stringify(diskMetaOf(next))
}

export function bookFromCatalog(row: CatalogRow): LibraryBook | null {
  const meta = row?.meta
  if (!meta || meta.id !== row.id || !ID_OK.test(row.id) || !row.filePath) return null
  if (!OPEN_EXTS.has(extOf(meta.fileName))) return null
  if (!Number.isFinite(meta.addedAt) || meta.addedAt < 0) return null
  const identity = diskMetaOf({
    id: row.id,
    title: meta.title ?? '',
    author: meta.author ?? '',
    fileName: meta.fileName,
    addedAt: meta.addedAt,
    language: scriptOf(meta.language),
    aiSlug: meta.aiSlug,
    aiBuiltAt: meta.aiBuiltAt,
  })
  return {
    ...identity,
    file: new Blob(),
    filePath: row.filePath,
    cover: null,
    lastOpenedAt: null,
    cfi: null,
    fraction: 0,
  }
}

export async function saveDiskMeta(book: Identity): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  const meta = diskMetaOf(book)
  await invoke('write_book_meta', new TextEncoder().encode(JSON.stringify(meta)), {
    headers: { 'x-book-id': book.id },
  })
}

/**
 * Write sidecars for books already on disk, then put back any sidecar the shelf lost.
 * Returns how many rows were added. Does not change progress of a book that is still here.
 */
export async function restoreDiskCatalog(): Promise<number> {
  if (!isTauri()) return 0
  const { listBooks, putBook } = await import('./db')
  const { invoke } = await import('@tauri-apps/api/core')
  const existing = await listBooks()
  for (const book of existing) {
    if (!book.filePath) continue
    try {
      await saveDiskMeta(book)
    } catch (error) {
      console.error('book catalog', book.id, error)
    }
  }
  const rows = (await invoke('list_book_catalog')) as CatalogRow[]
  if (!Array.isArray(rows)) return 0
  const seen = new Set(existing.map((book) => book.id))
  let added = 0
  for (const row of rows) {
    if (!row || seen.has(row.id)) continue
    const book = bookFromCatalog(row)
    if (!book) continue
    seen.add(book.id)
    try {
      await putBook(book)
      added += 1
    } catch (error) {
      console.error('book catalog', row.id, error)
    }
  }
  return added
}
