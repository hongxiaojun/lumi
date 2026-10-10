import type { LibraryBook } from '../../types'
import { listBooks, putBook } from '../db'
import { extractFromFoliate } from './fromFoliate'
import { persistAiBook, persistCatalog } from './persist'
import { bookSlug } from './slug'
import type { AiBook, CatalogEntry } from './types'

type FoliateLike = Parameters<typeof extractFromFoliate>[0]

export function uniqueSlug(base: string, id: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  return `${base}-${id.slice(0, 8)}`
}

export function catalogFromBooks(
  books: Array<Pick<LibraryBook, 'title' | 'author' | 'language' | 'aiSlug'>>,
): CatalogEntry[] {
  return books.map((book) => ({
    slug: book.aiSlug ?? bookSlug(book.title),
    title: book.title,
    author: book.author,
    language: book.language,
  }))
}

export async function buildAndPersist(
  foliate: FoliateLike,
  book: LibraryBook,
  allBooks: LibraryBook[],
): Promise<LibraryBook> {
  const extracted = await extractFromFoliate(foliate, book)
  const taken = new Set(
    allBooks.filter((row) => row.id !== book.id).map((row) => row.aiSlug ?? bookSlug(row.title)),
  )
  const ai: AiBook = { ...extracted, slug: uniqueSlug(extracted.slug, book.id, taken) }
  const next: LibraryBook = { ...book, aiSlug: ai.slug, aiBuiltAt: Date.now() }
  const catalog = catalogFromBooks(
    allBooks.some((row) => row.id === book.id)
      ? allBooks.map((row) => (row.id === book.id ? next : row))
      : [...allBooks, next],
  )
  await persistAiBook(ai, catalog)
  return next
}

export async function ensureAiDatabase(book: LibraryBook, allBooks?: LibraryBook[]): Promise<LibraryBook> {
  if (book.aiBuiltAt && book.aiSlug) return book
  const { makeBook } = await import('foliate-js/view.js')
  const foliate = (await makeBook(book.file)) as FoliateLike
  try {
    const rows = allBooks ?? (await listBooks())
    const next = await buildAndPersist(foliate, book, rows)
    if (!allBooks) await putBook(next)
    return next
  } finally {
    const destroy = (foliate as { destroy?: () => void }).destroy
    destroy?.()
  }
}

export async function rebuildCatalog(books: LibraryBook[]): Promise<void> {
  await persistCatalog(catalogFromBooks(books))
}
