import type { LibraryBook, Prefs, TranslatorConfig } from '../../types'
import type { Annotation } from '../notes'
import type { Bookmark } from '../bookmarks'
import { listBooks } from '../db'
import { importPrepared, type ImportHooks } from '../importBook'
import { buildAndPersist } from '../aiDb/build'
import type { BookLook } from '../bookLook'
import { lookOf } from '../bookLook'
import { randomId } from '../id'
import { sectionFraction } from '../parseGate'
import { readDevice, writeDevice, type DeviceAccount } from './device'
import type { HubShelfBook } from './types'

const SAMPLE_ID = '00000000-0000-4000-8000-000000000001'

export async function probeHub(): Promise<boolean> {
  try {
    const res = await fetch('/__leaf-hub/health')
    return res.ok
  } catch {
    return false
  }
}

async function send(userId: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (userId) headers.set('x-leaf-user', userId)
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`/__leaf-hub${path}`, { ...init, headers })
  if (!res.ok) throw new Error('这本书没有写入服务器')
  return res
}

const memoryStore = new Map<string, string>()
const memoryStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value)
  },
}

function browserStorage() {
  try {
    const key = 'leaf:storage-test'
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return localStorage
  } catch {
    return memoryStorage
  }
}

export async function ensureDevice(): Promise<DeviceAccount> {
  const storage = browserStorage()
  const local = readDevice(storage, navigator.userAgent, randomId)
  const res = await fetch('/__leaf-hub/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(local),
  })
  if (!res.ok) throw new Error('设备账号没有建成')
  const user = (await res.json()) as DeviceAccount
  writeDevice(storage, user)
  return user
}

function toShelfBook(row: HubShelfBook): LibraryBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    fileName: row.fileName,
    file: new Blob(),
    cover: null,
    coverUrl: row.hasCover ? `/__leaf-hub/books/${row.id}/cover` : undefined,
    addedAt: row.addedAt,
    lastOpenedAt: row.lastOpenedAt,
    cfi: row.cfi,
    fraction: row.fraction,
    language:
      row.language === 'en' || row.language === 'zh' || row.language === 'mixed' || row.language === 'other'
        ? row.language
        : undefined,
    parallel: row.parallel,
    aiSlug: row.aiSlug,
    aiBuiltAt: row.aiBuiltAt,
  }
}

export async function listShelf(userId: string): Promise<LibraryBook[]> {
  const res = await send(userId, '/books')
  const rows = (await res.json()) as HubShelfBook[]
  return rows.map(toShelfBook)
}

async function upload(userId: string, book: LibraryBook): Promise<void> {
  await send(userId, '/books', {
    method: 'POST',
    body: JSON.stringify({
      id: book.id,
      title: book.title,
      author: book.author,
      fileName: book.fileName,
      addedAt: book.addedAt,
      language: book.language,
      aiSlug: book.aiSlug,
      aiBuiltAt: book.aiBuiltAt,
    }),
  })
  await send(userId, `/books/${book.id}/file`, { method: 'PUT', body: book.file })
  if (book.cover && book.cover.size > 0) {
    await send(userId, `/books/${book.id}/cover`, { method: 'PUT', body: book.cover })
  }
}

export async function publishLocalBooks(userId: string): Promise<void> {
  const remote = new Set((await listShelf(userId)).map((book) => book.id))
  const local = await listBooks()
  for (const book of local) {
    if (remote.has(book.id) || !book.file || book.file.size === 0) continue
    await upload(userId, book)
    remote.add(book.id)
  }
}

export async function saveSharedMeta(userId: string, book: LibraryBook): Promise<void> {
  await send(userId, '/books', {
    method: 'POST',
    body: JSON.stringify({
      id: book.id,
      title: book.title,
      author: book.author,
      fileName: book.fileName,
      addedAt: book.addedAt,
      language: book.language,
      aiSlug: book.aiSlug,
      aiBuiltAt: book.aiBuiltAt,
    }),
  })
}

export async function importToHub(
  userId: string,
  files: File[],
  id?: string,
  hooks?: ImportHooks,
): Promise<string[]> {
  const errors: string[] = []
  for (const file of files) {
    try {
      await importPrepared(
        file,
        async (book, foliate) => {
          await upload(userId, book)
          hooks?.onBook?.(book, 0.4)
          try {
            const rows = await listShelf(userId)
            const next = await buildAndPersist(foliate, book, rows, (done, total) => {
              hooks?.onBook?.(book, sectionFraction(done, total))
            })
            await saveSharedMeta(userId, next)
            hooks?.onBook?.(next, 1)
            return next
          } catch {
            hooks?.onBook?.(book, 1)
            return book
          }
        },
        id,
        hooks,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : '这本书没有写入服务器'
      errors.push(`${file.name}：${reason}`)
    }
  }
  return errors
}

export async function seedHubIfEmpty(userId: string): Promise<void> {
  const rows = await listShelf(userId)
  if (rows.length > 0) return
  const res = await fetch('/samples/leaf-sample.epub')
  if (!res.ok) return
  const file = new File([await res.blob()], '叶读试读.epub', { type: 'application/epub+zip' })
  await importToHub(userId, [file], SAMPLE_ID)
}

export async function openSharedBook(userId: string, id: string): Promise<LibraryBook | null> {
  const rows = await listShelf(userId)
  const meta = rows.find((book) => book.id === id)
  if (!meta) return null
  const res = await fetch(`/__leaf-hub/books/${id}/file`)
  if (!res.ok) throw new Error('这本书没有写入服务器')
  const blob = await res.blob()
  return { ...meta, file: new File([blob], meta.fileName) }
}

export async function saveSharedProgress(
  userId: string,
  book: Pick<LibraryBook, 'id' | 'cfi' | 'fraction' | 'lastOpenedAt' | 'parallel'>,
): Promise<void> {
  await send(userId, '/progress', {
    method: 'PUT',
    body: JSON.stringify({
      bookId: book.id,
      cfi: book.cfi,
      fraction: book.fraction,
      lastOpenedAt: book.lastOpenedAt,
      parallel: book.parallel,
    }),
  })
}

export async function removeSharedBook(id: string): Promise<void> {
  const res = await fetch(`/__leaf-hub/books/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('这本书没有写入服务器')
}

export async function loadSharedPrefs(userId: string): Promise<Prefs | null> {
  const res = await send(userId, '/prefs')
  return (await res.json()) as Prefs | null
}

export async function saveSharedPrefs(userId: string, prefs: Prefs): Promise<void> {
  await send(userId, '/prefs', { method: 'PUT', body: JSON.stringify(prefs) })
}

export async function loadBookLook(userId: string, bookId: string): Promise<BookLook | null> {
  const res = await send(userId, `/book-look?bookId=${encodeURIComponent(bookId)}`)
  return (await res.json()) as BookLook | null
}

export async function saveBookLook(userId: string, bookId: string, prefs: Prefs): Promise<void> {
  await send(userId, '/book-look', {
    method: 'PUT',
    body: JSON.stringify({ bookId, look: lookOf(prefs) }),
  })
}

export async function loadSharedTranslator(userId: string): Promise<TranslatorConfig | null> {
  const res = await send(userId, '/translator')
  return (await res.json()) as TranslatorConfig | null
}

export async function saveSharedTranslator(userId: string, config: TranslatorConfig): Promise<void> {
  await send(userId, '/translator', { method: 'PUT', body: JSON.stringify(config) })
}

export async function loadSharedNotes(userId: string, bookId: string): Promise<Annotation[]> {
  const res = await send(userId, `/notes?bookId=${encodeURIComponent(bookId)}`)
  return (await res.json()) as Annotation[]
}

export async function saveSharedNote(userId: string, note: Annotation): Promise<void> {
  await send(userId, '/notes', { method: 'PUT', body: JSON.stringify(note) })
}

export async function deleteSharedNote(userId: string, id: string): Promise<void> {
  await send(userId, `/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function loadSharedBookmarks(userId: string, bookId: string): Promise<Bookmark[]> {
  const res = await send(userId, `/bookmarks?bookId=${encodeURIComponent(bookId)}`)
  return (await res.json()) as Bookmark[]
}

export async function saveSharedBookmark(userId: string, mark: Bookmark): Promise<void> {
  await send(userId, '/bookmarks', { method: 'PUT', body: JSON.stringify(mark) })
}

export async function deleteSharedBookmark(userId: string, id: string): Promise<void> {
  await send(userId, `/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export { SAMPLE_ID }
