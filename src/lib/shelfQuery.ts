import { matchesQuery } from './phoneTabs'
import { booksInSection, SHELF_INDEX, type ShelfSection } from './shelfIndex'

type Searchable = {
  title?: string | null
  author?: string | null
  fileName?: string | null
}

type Slotted = Searchable & {
  fraction: number | null | undefined
  lastOpenedAt?: number | null
}

export type ShelfRows<T> = {
  title: string
  books: T[]
  searching: boolean
}

/**
 * Rows for the wide shelf. A query searches every book and takes over the title,
 * the same way the phone's search tab ignores the section switch. An empty query
 * keeps the section index in charge.
 */
export function shelfRows<T extends Slotted>(
  books: readonly T[],
  section: ShelfSection,
  query: string,
): ShelfRows<T> {
  const needle = query.trim()
  if (!needle) {
    const label = SHELF_INDEX.find((item) => item.id === section)?.label ?? '我的藏书'
    return { title: label, books: booksInSection(books, section), searching: false }
  }
  return { title: '搜索结果', books: books.filter((book) => matchesQuery(book, needle)), searching: true }
}
