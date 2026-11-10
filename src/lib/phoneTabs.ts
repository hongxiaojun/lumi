export const PHONE_TAB_KEY = 'leaf:phone-tab'

export type PhoneTab = 'home' | 'books' | 'search' | 'brief'

export const PHONE_TABS: { id: PhoneTab; label: string }[] = [
  { id: 'home', label: '主页' },
  { id: 'books', label: '书库' },
  { id: 'search', label: '搜索' },
  { id: 'brief', label: '摘要' },
]

type Store = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function phoneTabOf(value: string | null | undefined): PhoneTab {
  if (value === 'home' || value === 'books' || value === 'search' || value === 'brief') return value
  return 'home'
}

export function readPhoneTab(storage: Store | null): PhoneTab {
  if (!storage) return 'home'
  try {
    return phoneTabOf(storage.getItem(PHONE_TAB_KEY))
  } catch {
    return 'home'
  }
}

export function writePhoneTab(storage: Store | null, tab: PhoneTab): void {
  if (!storage) return
  try {
    storage.setItem(PHONE_TAB_KEY, tab)
  } catch {
    /* a private window can refuse storage; the choice still applies this visit */
  }
}

type Named = { title?: string | null; author?: string | null; fileName?: string | null }

/** Match a shelf row by title, author, or file name. An empty query matches everything. */
export function matchesQuery(book: Named, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [book.title, book.author, book.fileName].some((part) => (part ?? '').toLowerCase().includes(needle))
}

type Opened = { lastOpenedAt?: number | null }

/** Books the reader has actually opened, newest first. */
export function continueBooks<T extends Opened>(books: readonly T[], limit = 8): T[] {
  return books
    .filter((book) => typeof book.lastOpenedAt === 'number' && book.lastOpenedAt > 0)
    .slice()
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, limit)
}

export type PhoneSection = 'all' | 'reading' | 'finished'

/** The phone book grid filters in place. Anything else is the whole shelf. */
export function phoneSectionOf(value: string | null | undefined): PhoneSection {
  if (value === 'reading' || value === 'finished') return value
  return 'all'
}

type Lit = { aiBuiltAt?: number | null }

/** Books whose original text has been indexed for citation. Not a generated summary. */
export function briefBooks<T extends Lit>(books: readonly T[]): T[] {
  return books
    .filter((book) => typeof book.aiBuiltAt === 'number' && book.aiBuiltAt > 0)
    .slice()
    .sort((a, b) => (b.aiBuiltAt ?? 0) - (a.aiBuiltAt ?? 0))
}
