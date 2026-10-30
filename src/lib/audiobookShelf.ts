export const AUDIOBOOK_KEY = 'leaf:audiobooks'

export const AUDIOBOOK_WAITING = '已加入有声书。转换还没开始。'

export type AudiobookStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export type AudiobookGesture = 'join' | 'leave' | 'none'

type AudiobookSection = 'library' | 'reading' | 'finished' | 'audiobook'

/** A stored list is the only permission to prepare one book. An empty list prepares nothing. */
export function parseAudiobookIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function addAudiobook(ids: readonly string[], id: string): string[] {
  const clean = id.trim()
  if (!clean || ids.includes(clean)) return ids.slice()
  return [...ids, clean]
}

export function removeAudiobook(ids: readonly string[], id: string): string[] {
  const clean = id.trim()
  if (!clean || !ids.includes(clean)) return ids.slice()
  return ids.filter((item) => item !== clean)
}

export function audiobookAllowed(ids: readonly string[], id: string): boolean {
  const clean = id.trim()
  return clean.length > 0 && ids.includes(clean)
}

export function audiobookBooks<T extends { id?: string }>(books: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map<string, T>()
  for (const book of books) {
    if (book.id && !byId.has(book.id)) byId.set(book.id, book)
  }
  const seen = new Set<string>()
  const out: T[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const book = byId.get(id)
    if (book) out.push(book)
  }
  return out
}

/** 我的藏书 and 已读完 can add. 正在读 does not. The column itself only removes membership. */
export function audiobookGesture(section: AudiobookSection): AudiobookGesture {
  if (section === 'library' || section === 'finished') return 'join'
  if (section === 'audiobook') return 'leave'
  return 'none'
}

export function readAudiobookIds(storage: AudiobookStore | null): string[] {
  if (!storage) return []
  try {
    return parseAudiobookIds(storage.getItem(AUDIOBOOK_KEY))
  } catch {
    return []
  }
}

export function writeAudiobookIds(storage: AudiobookStore | null, ids: readonly string[]): void {
  if (!storage) return
  try {
    storage.setItem(AUDIOBOOK_KEY, JSON.stringify(parseAudiobookIds(JSON.stringify([...ids]))))
  } catch {
    // A locked or full store still lets this visit switch. It just will not remember.
  }
}
