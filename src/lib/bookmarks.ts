import { randomId } from './id'

export type Bookmark = {
  id: string
  bookId: string
  cfi: string
  label: string
  createdAt: number
}

export function createBookmark(input: {
  bookId: string
  cfi: string
  label?: string
  now?: number
}): Bookmark {
  const cfi = input.cfi.trim()
  if (!cfi) throw new Error('无法定位当前页')
  const label = (input.label ?? '').replace(/\s+/g, ' ').trim() || '书签'
  return {
    id: input.now ? `m${input.now}` : randomId(),
    bookId: input.bookId,
    cfi,
    label,
    createdAt: input.now ?? Date.now(),
  }
}

export function bookmarksForBook(all: Bookmark[], bookId: string): Bookmark[] {
  return all.filter((row) => row.bookId === bookId).sort((a, b) => b.createdAt - a.createdAt)
}

export function isCurrentBookmark(all: Bookmark[], bookId: string, cfi: string | null | undefined): boolean {
  if (!cfi) return false
  return all.some((row) => row.bookId === bookId && row.cfi === cfi)
}

export function toggleBookmark(
  list: Bookmark[],
  mark: Bookmark,
): { list: Bookmark[]; added: boolean } {
  const existing = list.find((row) => row.bookId === mark.bookId && row.cfi === mark.cfi)
  if (existing) {
    return { list: list.filter((row) => row.id !== existing.id), added: false }
  }
  return { list: [mark, ...list], added: true }
}
