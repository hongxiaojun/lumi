import { normalizeQuote } from './anchor'
import { randomId } from './id'

export type NoteColor = 'yellow' | 'orange' | 'green' | 'blue' | 'purple' | 'pink'

export type AnchorState = 'ambiguous' | 'orphan'

export type Annotation = {
  id: string
  bookId: string
  cfi: string
  text: string
  note: string
  color: NoteColor
  createdAt: number
  prefix?: string
  suffix?: string
  anchor?: AnchorState
}

export const NOTE_COLORS: { id: NoteColor; hex: string; name: string }[] = [
  { id: 'yellow', hex: '#F6D36B', name: '黄' },
  { id: 'orange', hex: '#F0A24A', name: '橙' },
  { id: 'green', hex: '#88C97A', name: '绿' },
  { id: 'blue', hex: '#6BB0E0', name: '蓝' },
  { id: 'purple', hex: '#B894E0', name: '紫' },
  { id: 'pink', hex: '#EE8BA8', name: '粉' },
]

export function isNoteColor(value: string): value is NoteColor {
  return NOTE_COLORS.some((c) => c.id === value)
}

export function colorHex(color: NoteColor): string {
  return NOTE_COLORS.find((c) => c.id === color)?.hex ?? NOTE_COLORS[0].hex
}

export function createAnnotation(input: {
  bookId: string
  cfi: string
  text: string
  color?: NoteColor
  note?: string
  prefix?: string
  suffix?: string
  now?: number
}): Annotation {
  const text = normalizeQuote(input.text)
  if (!text) throw new Error('没有选中文字')
  if (!input.cfi) throw new Error('无法定位这段文字')
  return {
    id: input.now ? `n${input.now}` : randomId(),
    bookId: input.bookId,
    cfi: input.cfi,
    text,
    note: input.note ?? '',
    color: input.color ?? 'yellow',
    createdAt: input.now ?? Date.now(),
    prefix: normalizeQuote(input.prefix ?? ''),
    suffix: normalizeQuote(input.suffix ?? ''),
  }
}

export function notesForBook(all: Annotation[], bookId: string): Annotation[] {
  return all.filter((a) => a.bookId === bookId).sort((a, b) => b.createdAt - a.createdAt)
}

export function mergeAnnotation(list: Annotation[], row: Annotation): Annotation[] {
  const index = list.findIndex((item) => item.bookId === row.bookId && item.cfi === row.cfi)
  if (index < 0) return [row, ...list]
  const next = [...list]
  next[index] = {
    ...next[index],
    color: row.color,
    text: row.text,
    prefix: row.prefix || next[index].prefix,
    suffix: row.suffix || next[index].suffix,
  }
  return next
}
