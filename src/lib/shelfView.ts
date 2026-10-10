export const SHELF_VIEW_KEY = 'leaf:shelf'

export type ShelfView = 'cover' | 'stand'

type ShelfStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function shelfViewOf(value: string | null | undefined): ShelfView {
  return value === 'cover' || value === 'stand' ? value : 'stand'
}

export function readShelfView(storage: ShelfStore | null): ShelfView {
  if (!storage) return 'stand'
  try {
    return shelfViewOf(storage.getItem(SHELF_VIEW_KEY))
  } catch {
    return 'stand'
  }
}

export function writeShelfView(storage: ShelfStore | null, view: ShelfView): void {
  if (!storage) return
  try {
    storage.setItem(SHELF_VIEW_KEY, view)
  } catch {
    // A locked or full store still lets this visit switch. It just will not remember.
  }
}

export function browserShelfStorage(): ShelfStore | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}
