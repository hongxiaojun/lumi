import type { LibraryBook } from '../types'
import { getBook, putBook } from './db'

const tried = new Set<string>()
let chain = Promise.resolve()

function needsCover(book: LibraryBook): boolean {
  if (book.cover && book.cover.size > 0) return false
  return Boolean(book.filePath || (book.file && book.file.size > 0))
}

/** One attempt per book, one book at a time. Already-null covers are filled from the file. */
export function restoreMissingCovers(books: readonly LibraryBook[], onUpdated: () => void): void {
  for (const book of books) {
    if (!needsCover(book) || tried.has(book.id)) continue
    tried.add(book.id)
    chain = chain.then(() => restoreOne(book)).then((changed) => {
      if (changed) onUpdated()
    })
  }
}

async function restoreOne(book: LibraryBook): Promise<boolean> {
  try {
    const full = book.file && book.file.size > 0 ? book : await getBook(book.id)
    if (!full?.file || full.file.size === 0 || (full.cover && full.cover.size > 0)) return false
    const { makeBook } = await import('foliate-js/view.js')
    const opened = (await makeBook(full.file)) as {
      getCover?: () => Promise<Blob | null>
      destroy?: () => void
    }
    try {
      const cover = (await opened.getCover?.()) ?? null
      if (!cover || cover.size === 0) return false
      await putBook({ ...full, cover })
      return true
    } finally {
      opened.destroy?.()
    }
  } catch (error) {
    console.error('restore cover', book.id, error)
    return false
  }
}
