import type { LibraryBook, Prefs, TranslatorConfig } from '../types'
import type { Annotation } from './notes'
import type { Bookmark } from './bookmarks'
import type { BookLook } from './bookLook'
import { lookOf } from './bookLook'
import { DEFAULT_PREFS } from './styles'
import { DEFAULT_SECRETS } from './translate/engines'

const DB_NAME = 'leaf-reader'
const DB_VERSION = 3

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv')
      }
      if (!db.objectStoreNames.contains('annotations')) {
        const store = db.createObjectStore('annotations', { keyPath: 'id' })
        store.createIndex('bookId', 'bookId')
      }
      if (!db.objectStoreNames.contains('translations')) {
        db.createObjectStore('translations')
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        const store = db.createObjectStore('bookmarks', { keyPath: 'id' })
        store.createIndex('bookId', 'bookId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function reqOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listBooks(): Promise<LibraryBook[]> {
  const db = await openDb()
  const tx = db.transaction('books', 'readonly')
  const rows = (await reqOf(tx.objectStore('books').getAll())) as LibraryBook[]
  return rows.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
}

export async function getBook(id: string): Promise<LibraryBook | undefined> {
  const db = await openDb()
  const tx = db.transaction('books', 'readonly')
  return reqOf(tx.objectStore('books').get(id)) as Promise<LibraryBook | undefined>
}

export async function putBook(book: LibraryBook): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('books', 'readwrite')
  await reqOf(tx.objectStore('books').put(book))
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('books', 'readwrite')
  await reqOf(tx.objectStore('books').delete(id))
  const notes = db.transaction('annotations', 'readwrite')
  const index = notes.objectStore('annotations').index('bookId')
  const rows = (await reqOf(index.getAll(id))) as Annotation[]
  for (const row of rows) await reqOf(notes.objectStore('annotations').delete(row.id))
  const marks = db.transaction('bookmarks', 'readwrite')
  const markIndex = marks.objectStore('bookmarks').index('bookId')
  const pinned = (await reqOf(markIndex.getAll(id))) as Bookmark[]
  for (const row of pinned) await reqOf(marks.objectStore('bookmarks').delete(row.id))
}

export async function loadPrefs(): Promise<Prefs> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readonly')
  const stored = (await reqOf(tx.objectStore('kv').get('prefs'))) as Prefs | undefined
  return { ...DEFAULT_PREFS, ...stored }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').put(prefs, 'prefs'))
}

async function localLooks(): Promise<Record<string, BookLook>> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readonly')
  return ((await reqOf(tx.objectStore('kv').get('book-looks'))) as Record<string, BookLook> | undefined) ?? {}
}

export async function loadLocalBookLook(bookId: string): Promise<BookLook | null> {
  const all = await localLooks()
  return all[bookId] ?? null
}

export async function saveLocalBookLook(bookId: string, prefs: Prefs): Promise<void> {
  const all = await localLooks()
  all[bookId] = lookOf(prefs)
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').put(all, 'book-looks'))
}

export async function loadTranslator(): Promise<TranslatorConfig> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readonly')
  const stored = (await reqOf(tx.objectStore('kv').get('translator'))) as TranslatorConfig | undefined
  return {
    engine: stored?.engine ?? 'google',
    direction: stored?.direction ?? 'auto',
    secrets: { ...DEFAULT_SECRETS, ...stored?.secrets },
  }
}

export async function saveTranslator(config: TranslatorConfig): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').put(config, 'translator'))
}

export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const db = await openDb()
  const tx = db.transaction('annotations', 'readonly')
  const rows = (await reqOf(tx.objectStore('annotations').index('bookId').getAll(bookId))) as Annotation[]
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function putAnnotation(row: Annotation): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('annotations', 'readwrite')
  await reqOf(tx.objectStore('annotations').put(row))
}

export async function deleteAnnotation(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('annotations', 'readwrite')
  await reqOf(tx.objectStore('annotations').delete(id))
}

export async function listBookmarks(bookId: string): Promise<Bookmark[]> {
  const db = await openDb()
  const tx = db.transaction('bookmarks', 'readonly')
  const rows = (await reqOf(tx.objectStore('bookmarks').index('bookId').getAll(bookId))) as Bookmark[]
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function putBookmark(row: Bookmark): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('bookmarks', 'readwrite')
  await reqOf(tx.objectStore('bookmarks').put(row))
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('bookmarks', 'readwrite')
  await reqOf(tx.objectStore('bookmarks').delete(id))
}

export async function getTranslation(key: string): Promise<string | undefined> {
  const db = await openDb()
  const tx = db.transaction('translations', 'readonly')
  return reqOf(tx.objectStore('translations').get(key)) as Promise<string | undefined>
}

export async function putTranslation(key: string, text: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('translations', 'readwrite')
  await reqOf(tx.objectStore('translations').put(text, key))
}
