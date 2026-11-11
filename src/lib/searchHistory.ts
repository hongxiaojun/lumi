export const SEARCH_HISTORY_KEY = 'leaf:phone-search-history'
export const SEARCH_HISTORY_LIMIT = 5

type Store = { getItem(key: string): string | null }

/** Newest query first. A blank query changes nothing. The same words stay one record. */
export function rememberSearch(history: readonly string[], query: string): string[] {
  const text = query.trim()
  if (!text) return history.slice(0, SEARCH_HISTORY_LIMIT)
  const key = text.toLowerCase()
  const next = [text, ...history.filter((item) => item.trim().toLowerCase() !== key)]
  return next.slice(0, SEARCH_HISTORY_LIMIT)
}

/** The stored list is newest first. Broken JSON is an empty history. */
export function readSearchHistory(storage: Store | null): string[] {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(SEARCH_HISTORY_KEY) ?? 'null')
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string') continue
      const text = item.trim()
      const key = text.toLowerCase()
      if (!text || seen.has(key)) continue
      seen.add(key)
      out.push(text)
      if (out.length === SEARCH_HISTORY_LIMIT) break
    }
    return out
  } catch {
    return []
  }
}

export function writeSearchHistory(storage: { setItem(key: string, value: string): void } | null, history: readonly string[]): void {
  if (!storage) return
  try {
    storage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT)))
  } catch {
    /* a private window can refuse storage; the list still applies this visit */
  }
}
