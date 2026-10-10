const SPINE_LIMIT = 14

const CLOTHS = [
  { cloth: '#7a3b3b', ink: '#f6efe4' },
  { cloth: '#243044', ink: '#f4efe6' },
  { cloth: '#3d4f3a', ink: '#f4efe6' },
  { cloth: '#8d5a32', ink: '#fbf6ee' },
  { cloth: '#5c4a6e', ink: '#f6efe8' },
  { cloth: '#3e4f5a', ink: '#f4efe6' },
  { cloth: '#6b442e', ink: '#f8f1e6' },
  { cloth: '#2f4a45', ink: '#f3eee4' },
  { cloth: '#8a3d4b', ink: '#f8f1e8' },
  { cloth: '#4a3f36', ink: '#f6efe4' },
] as const

export type Cloth = { cloth: string; ink: string }

export function spineLabel(title: string): string {
  const trimmed = title.replace(/\s+/g, ' ').trim()
  if (!trimmed) return '未命名'
  const withoutLead = trimmed.replace(/^[([（【〔［][^)\]）】〕］]*[)\]）】〕］]\s*/, '')
  const cut = withoutLead.split(/[([（【〔［:：·]/)[0]?.trim() ?? ''
  const name = cut || '未命名'
  const chars = [...name]
  if (chars.length <= SPINE_LIMIT) return name
  if (/[A-Za-z]/.test(name)) {
    let kept = ''
    for (const word of name.split(' ')) {
      if (!word) continue
      const next = kept ? `${kept} ${word}` : word
      if ([...next].length > SPINE_LIMIT) break
      kept = next
    }
    if (kept) return kept
  }
  return chars.slice(0, SPINE_LIMIT).join('')
}

export function clothFor(id: string): Cloth {
  let hash = 0
  for (const char of id) hash = (hash * 33 + char.codePointAt(0)!) >>> 0
  return CLOTHS[hash % CLOTHS.length]
}

export function featuredBookId(
  books: readonly { id: string; lastOpenedAt: number | null }[],
  chosen: string | null,
): string | null {
  if (books.length === 0) return null
  if (chosen && books.some((book) => book.id === chosen)) return chosen
  let best = books[0]
  for (const book of books) {
    const at = book.lastOpenedAt ?? -1
    const bestAt = best.lastOpenedAt ?? -1
    if (at > bestAt) best = book
  }
  if (best.lastOpenedAt) return best.id
  return books[0].id
}

export function plankRows<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return []
  if (size < 1) return [items.slice()]
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

export function plankSize(width: number): number {
  if (!Number.isFinite(width) || width < 520) return 5
  if (width < 900) return 10
  return 14
}
