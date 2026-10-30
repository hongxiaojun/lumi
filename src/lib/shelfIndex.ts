import { readingPlace } from './format'

export const SHELF_SECTION_KEY = 'leaf:shelf-section'

export type ShelfSection = 'library' | 'reading' | 'finished'

export const SHELF_INDEX: { id: ShelfSection; label: string }[] = [
  { id: 'library', label: '我的藏书' },
  { id: 'reading', label: '正在读' },
  { id: 'finished', label: '已读完' },
]

type ShelfBook = {
  fraction: number | null | undefined
  lastOpenedAt?: number | null
}

type ShelfStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function shelfSectionOf(value: string | null | undefined): ShelfSection {
  if (value === 'library' || value === 'reading' || value === 'finished') return value
  return 'library'
}

function openedAt(at: number | null | undefined): number {
  return typeof at === 'number' && Number.isFinite(at) ? at : 0
}

/** The whole shelf stays in shelf order. Reading and finished lists follow the last open. */
export function booksInSection<T extends ShelfBook>(books: readonly T[], section: ShelfSection): T[] {
  if (section === 'library') return books.slice()
  const place = section === 'finished' ? 'finished' : 'reading'
  return books
    .filter((book) => readingPlace(book.fraction) === place)
    .slice()
    .sort((a, b) => openedAt(b.lastOpenedAt) - openedAt(a.lastOpenedAt))
}

export function sectionCounts(books: readonly ShelfBook[]): Record<ShelfSection, number> {
  const counts = { library: books.length, reading: 0, finished: 0 }
  for (const book of books) {
    const place = readingPlace(book.fraction)
    if (place === 'reading') counts.reading += 1
    else if (place === 'finished') counts.finished += 1
  }
  return counts
}

export type ShelfMark = 'delete' | 'drop'

/** The whole library deletes the file. The other two shelves only clear the reading place. */
export function shelfMark(section: ShelfSection): ShelfMark {
  return section === 'library' ? 'delete' : 'drop'
}

export function shelfMarkPhrase(section: ShelfSection): string {
  if (section === 'reading') return '移出正在读'
  if (section === 'finished') return '移出已读完'
  return '删除书籍'
}

type PlacedBook = {
  fraction?: number | null
  cfi?: string | null
}

/** Forget where the book was. The file, title, and last open stay. */
export function droppedRecord<T extends PlacedBook>(book: T): T {
  return { ...book, fraction: 0, cfi: null }
}

export function emptyIndexCopy(section: ShelfSection): string | null {
  if (section === 'reading') return '还没有正在读的书'
  if (section === 'finished') return '还没有读完的书'
  return null
}

export function readShelfSection(storage: ShelfStore | null): ShelfSection {
  if (!storage) return 'library'
  try {
    return shelfSectionOf(storage.getItem(SHELF_SECTION_KEY))
  } catch {
    return 'library'
  }
}

export function writeShelfSection(storage: ShelfStore | null, section: ShelfSection): void {
  if (!storage) return
  try {
    storage.setItem(SHELF_SECTION_KEY, section)
  } catch {
    // A locked or full store still lets this visit switch. It just will not remember.
  }
}
