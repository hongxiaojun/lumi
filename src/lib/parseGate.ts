import type { LibraryBook } from '../types'

/** A book stays locked while its gate is present and still below 1. */
export function parseFractionOf(
  gates: Readonly<Record<string, number>> | undefined,
  id: string,
): number | null {
  if (!gates) return null
  const n = gates[id]
  if (typeof n !== 'number' || !Number.isFinite(n) || n >= 1) return null
  return Math.max(0, n)
}

export function bookIsParsing(gates: Readonly<Record<string, number>> | undefined, id: string): boolean {
  return parseFractionOf(gates, id) !== null
}

export function openAllowed(gates: Readonly<Record<string, number>> | undefined, id: string): boolean {
  return !bookIsParsing(gates, id)
}

export function parsePercent(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100)
}

export function parseCaption(fraction: number): string {
  return `正在解析 ${parsePercent(fraction)}%`
}

/** Metadata occupies the first 40%. Sections fill up to 99% until the row is saved. */
export function sectionFraction(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0.4
  const ratio = Math.min(1, Math.max(0, done / total))
  return Math.min(0.99, 0.4 + 0.59 * ratio)
}

export function upsertBook(rows: readonly LibraryBook[], book: LibraryBook): LibraryBook[] {
  return [book, ...rows.filter((row) => row.id !== book.id)]
}
