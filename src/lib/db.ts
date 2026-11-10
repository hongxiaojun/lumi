import type { FontId, LibraryBook, Prefs, TranslatorConfig, TtsConfig } from '../types'
import type { Annotation } from './notes'
import type { Bookmark } from './bookmarks'
import type { BookLook } from './bookLook'
import { lookOf } from './bookLook'
import type { UserFont } from './userFonts'
import { looksReplacingFont, looksWithFont } from './userFonts'
import { saveDiskMeta, shouldWriteDiskMeta } from './bookCatalog'
import { coverToStore } from './coverBlob'
import { readBookChunks, readBookUrl } from './ipcBytes'
import { DEFAULT_PREFS } from './styles'
import { DEFAULT_SECRETS } from './translate/engines'
import { normalizeTts } from './tts/config'

const DB_NAME = 'leaf-reader'
const DB_VERSION = 3
const USER_FONTS_KEY = 'user-fonts'

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

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function tauriInvoke() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke
}

export function bookExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'epub'
}

async function getBookRecord(id: string): Promise<LibraryBook | undefined> {
  const db = await openDb()
  const tx = db.transaction('books', 'readonly')
  return reqOf(tx.objectStore('books').get(id)) as Promise<LibraryBook | undefined>
}

async function readBookBytes(id: string, ext: string): Promise<Uint8Array> {
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    return await readBookUrl(convertFileSrc(`${id}.${ext}`, 'leafbook'))
  } catch (error) {
    console.error('leafbook', error)
    const invoke = await tauriInvoke()
    return readBookChunks((offset, length) => invoke('read_book_file', { id, ext, offset, length }))
  }
}

export async function getBook(id: string): Promise<LibraryBook | undefined> {
  const record = await getBookRecord(id)
  if (!record?.filePath || !isTauri()) return record
  const bytes = await readBookBytes(id, bookExt(record.fileName))
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  // Foliate tells EPUB from CBZ by the file name. A bare Blob has none, and the
  // zip check then throws before the book is parsed.
  const name = record.fileName.trim() || `book.${bookExt(record.fileName)}`
  return { ...record, file: new File([copy], name) }
}

export async function putBook(book: LibraryBook): Promise<void> {
  // Legacy = row already in IDB without filePath (still holds Blob). Migrating those is M10-3.
  // If the stored row OR the caller already has filePath, always take the disk path — never rewrite Blob.
  const existing = await getBookRecord(book.id)
  const withCover: LibraryBook = { ...book, cover: await coverToStore(book.cover, existing?.cover) }
  let record: LibraryBook | Omit<LibraryBook, 'file'> = withCover
  const legacy = isTauri() && !!existing && !existing.filePath && !book.filePath
  if (isTauri() && !legacy) {
    let filePath = book.filePath ?? existing?.filePath
    if (!filePath) {
      const invoke = await tauriInvoke()
      const bytes = new Uint8Array(await book.file.arrayBuffer())
      filePath = await invoke<string>('write_book_file', bytes, {
        headers: { 'x-book-id': book.id, 'x-book-ext': bookExt(book.fileName) },
      })
    }
    const { file: _file, ...meta } = withCover
    record = { ...meta, filePath }
  }
  const db = await openDb()
  const tx = db.transaction('books', 'readwrite')
  await reqOf(tx.objectStore('books').put(record))
  const next: LibraryBook = { ...book, ...record, file: book.file }
  if (shouldWriteDiskMeta(existing, next)) {
    try {
      await saveDiskMeta(next)
    } catch (error) {
      console.error('book catalog', book.id, error)
    }
  }
}

export async function deleteBook(id: string): Promise<void> {
  if (isTauri()) {
    const record = await getBookRecord(id)
    if (record?.filePath) {
      const invoke = await tauriInvoke()
      await invoke('delete_book_file', { id, ext: bookExt(record.fileName) })
    }
  }
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
  const kv = db.transaction('kv', 'readwrite')
  await reqOf(kv.objectStore('kv').delete(ttsPositionKey(id)))
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

export async function loadUserFonts(): Promise<UserFont[]> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readonly')
  const stored = (await reqOf(tx.objectStore('kv').get(USER_FONTS_KEY))) as UserFont[] | undefined
  return Array.isArray(stored) ? stored : []
}

export async function saveUserFonts(fonts: UserFont[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').put(fonts, USER_FONTS_KEY))
}

/** Every saved look takes this face. Books with no look stay on the device template. */
export async function replaceLocalLookFonts(font: FontId): Promise<void> {
  const next = looksWithFont(await localLooks(), font)
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').put(next, 'book-looks'))
}

export async function replaceMatchingLocalLookFont(from: FontId, to: FontId): Promise<void> {
  const current = await localLooks()
  const next = looksReplacingFont(current, from, to)
  if (next === current) return
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').put(next, 'book-looks'))
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

export async function loadTts(): Promise<TtsConfig> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readonly')
  const stored = (await reqOf(tx.objectStore('kv').get('tts'))) as Partial<TtsConfig> | undefined
  return normalizeTts(stored)
}

export async function saveTts(config: TtsConfig): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').put(normalizeTts(config), 'tts'))
}

/** Where listening stopped, kept apart from the reading CFI and fraction. */
export type TtsPosition = {
  cfi?: string | null
  fraction?: number
  updatedAt?: number
}

function ttsPositionKey(bookId: string): string {
  return `tts-position:${bookId}`
}

export async function loadTtsPosition(bookId: string): Promise<TtsPosition | null> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readonly')
  const stored = (await reqOf(tx.objectStore('kv').get(ttsPositionKey(bookId)))) as TtsPosition | undefined
  return stored ?? null
}

export async function saveTtsPosition(bookId: string, position: TtsPosition): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  const row: TtsPosition = {
    cfi: position.cfi ?? null,
    fraction: typeof position.fraction === 'number' ? position.fraction : 0,
    updatedAt: Date.now(),
  }
  await reqOf(tx.objectStore('kv').put(row, ttsPositionKey(bookId)))
}

export async function clearTtsPosition(bookId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  await reqOf(tx.objectStore('kv').delete(ttsPositionKey(bookId)))
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

async function putBookRecord(record: LibraryBook | Omit<LibraryBook, 'file'>): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('books', 'readwrite')
  await reqOf(tx.objectStore('books').put(record))
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

async function writeMigrationText(
  invoke: Awaited<ReturnType<typeof tauriInvoke>>,
  backupDir: string,
  fileName: 'books.json' | 'migration.log',
  text: string,
): Promise<void> {
  await invoke('write_migration_text', encodeText(text), {
    headers: { 'x-backup-dir': backupDir, 'x-file-name': fileName },
  })
}

function migrationStamp(): string {
  return new Date().toISOString()
}

/** In-flight M10-3 run; StrictMode / double-boot share one Promise. */
let migrateInFlight: Promise<void> | null = null

/** M10-3: one-shot Tauri startup migration of legacy IndexedDB Blobs onto disk. */
export async function migrateLegacyBooks(): Promise<void> {
  if (!isTauri()) return
  if (migrateInFlight) return migrateInFlight
  migrateInFlight = migrateLegacyBooksOnce().finally(() => {
    migrateInFlight = null
  })
  return migrateInFlight
}

async function migrateLegacyBooksOnce(): Promise<void> {
  const all = await listBooks()
  const legacy = all.filter((book) => !book.filePath && book.file && book.file.size > 0)
  if (!legacy.length) return

  const invoke = await tauriInvoke()
  const backupDir = `backup-${Date.now()}`

  try {
    const meta: Omit<LibraryBook, 'file' | 'cover'>[] = []
    for (const book of legacy) {
      const bytes = new Uint8Array(await book.file.arrayBuffer())
      await invoke('backup_book_file', bytes, {
        headers: {
          'x-backup-dir': backupDir,
          'x-book-id': book.id,
          'x-book-ext': bookExt(book.fileName),
        },
      })
      const { file: _f, cover: _c, ...rest } = book
      meta.push(rest)
    }
    await writeMigrationText(invoke, backupDir, 'books.json', JSON.stringify(meta, null, 2))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    try {
      await writeMigrationText(
        invoke,
        backupDir,
        'migration.log',
        `${migrationStamp()} BACKUP_FAILED ${reason}\n`,
      )
    } catch {
      console.error('M10-3 backup failed', error)
    }
    return
  }

  for (const book of legacy) {
    try {
      const bytes = new Uint8Array(await book.file.arrayBuffer())
      const ext = bookExt(book.fileName)
      const filePath = await invoke<string>('write_book_file', bytes, {
        headers: { 'x-book-id': book.id, 'x-book-ext': ext },
      })
      const readBack = await readBookChunks((offset, length) =>
        invoke('read_book_file', { id: book.id, ext, offset, length }),
      )
      const readLen = readBack.byteLength
      if (readLen !== bytes.length) {
        throw new Error(`size mismatch ${readLen} != ${bytes.length}`)
      }
      const { file: _file, ...meta } = book
      await putBookRecord({ ...meta, filePath })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      try {
        await writeMigrationText(
          invoke,
          backupDir,
          'migration.log',
          `${migrationStamp()} ${book.id} ${book.title} ${reason}\n`,
        )
      } catch {
        console.error('M10-3 migrate failed', book.id, error)
      }
    }
  }
}
