import fs from 'node:fs'
import path from 'node:path'
import type { HubBookMeta, HubProgress, HubShelfBook, HubUser } from '../src/lib/hub/types.ts'

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY_RE = /^[A-Za-z0-9_-]{1,80}$/

type HubRow = { id: string; bookId: string }

function assertId(id: string): string {
  if (!ID_RE.test(id)) throw new Error('bad id')
  return id.toLowerCase()
}

function assertKey(id: string): string {
  if (!KEY_RE.test(id)) throw new Error('bad id')
  return id
}

function cleanName(name: string): string {
  const next = name.replace(/\s+/g, ' ').trim().slice(0, 40)
  return next || '设备'
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

export function createHub(root: string) {
  const usersFile = path.join(root, 'users.json')
  const bookDir = (id: string) => path.join(root, 'books', assertId(id))
  const userDir = (id: string) => path.join(root, 'users', assertId(id))

  function users(): HubUser[] {
    return readJson<HubUser[]>(usersFile, [])
  }

  function session(id: string, name: string): HubUser {
    const key = assertId(id)
    const all = users()
    const found = all.find((user) => user.id === key)
    if (found) return found
    const user: HubUser = { id: key, name: cleanName(name), createdAt: Date.now() }
    all.push(user)
    writeJson(usersFile, all)
    fs.mkdirSync(userDir(key), { recursive: true })
    return user
  }

  function requireUser(id: string): HubUser {
    const key = assertId(id)
    const found = users().find((user) => user.id === key)
    if (!found) throw new Error('设备账号不存在')
    return found
  }

  function metaOf(id: string): HubBookMeta | null {
    return readJson<HubBookMeta | null>(path.join(bookDir(id), 'meta.json'), null)
  }

  function saveMeta(meta: Omit<HubBookMeta, 'hasCover'> & { hasCover?: boolean }): HubBookMeta {
    const id = assertId(meta.id)
    const dir = bookDir(id)
    fs.mkdirSync(dir, { recursive: true })
    const prev = metaOf(id)
    const next: HubBookMeta = {
      id,
      title: meta.title.trim() || '未命名',
      author: meta.author.trim() || '未知作者',
      fileName: meta.fileName.trim() || 'book.epub',
      addedAt: prev?.addedAt ?? meta.addedAt ?? Date.now(),
      language: meta.language,
      aiSlug: meta.aiSlug,
      aiBuiltAt: meta.aiBuiltAt,
      hasCover: meta.hasCover ?? prev?.hasCover ?? fs.existsSync(path.join(dir, 'cover.bin')),
    }
    writeJson(path.join(dir, 'meta.json'), next)
    return next
  }

  function filePath(id: string): string {
    return path.join(bookDir(id), 'book.bin')
  }

  function coverPath(id: string): string {
    return path.join(bookDir(id), 'cover.bin')
  }

  function markCover(id: string, hasCover: boolean): void {
    const meta = metaOf(id)
    if (!meta) return
    writeJson(path.join(bookDir(id), 'meta.json'), { ...meta, hasCover })
  }

  function progressMap(userId: string): Record<string, HubProgress> {
    return readJson(path.join(userDir(userId), 'progress.json'), {})
  }

  function listShelf(userId: string): HubShelfBook[] {
    requireUser(userId)
    const progress = progressMap(userId)
    if (!fs.existsSync(path.join(root, 'books'))) return []
    const rows: HubShelfBook[] = []
    for (const name of fs.readdirSync(path.join(root, 'books'))) {
      if (!ID_RE.test(name)) continue
      const meta = metaOf(name)
      if (!meta || !fs.existsSync(filePath(name))) continue
      const mine = progress[meta.id] ?? { cfi: null, fraction: 0, lastOpenedAt: null }
      rows.push({ ...meta, ...mine })
    }
    return rows.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
  }

  function saveProgress(userId: string, bookId: string, progress: HubProgress): void {
    requireUser(userId)
    const id = assertId(bookId)
    if (!metaOf(id)) throw new Error('找不到这本书')
    const all = progressMap(userId)
    all[id] = {
      cfi: progress.cfi,
      fraction: progress.fraction,
      lastOpenedAt: progress.lastOpenedAt,
      parallel: progress.parallel,
    }
    writeJson(path.join(userDir(userId), 'progress.json'), all)
  }

  function notes(userId: string): HubRow[] {
    return readJson(path.join(userDir(userId), 'notes.json'), [])
  }

  function bookmarks(userId: string): HubRow[] {
    return readJson(path.join(userDir(userId), 'bookmarks.json'), [])
  }

  function putNote(userId: string, note: HubRow): void {
    requireUser(userId)
    assertKey(note.id)
    assertId(note.bookId)
    const all = notes(userId).filter((row) => row.id !== note.id)
    all.push(note)
    writeJson(path.join(userDir(userId), 'notes.json'), all)
  }

  function deleteNote(userId: string, noteId: string): void {
    requireUser(userId)
    const key = assertKey(noteId)
    writeJson(
      path.join(userDir(userId), 'notes.json'),
      notes(userId).filter((row) => row.id !== key),
    )
  }

  function putBookmark(userId: string, mark: HubRow): void {
    requireUser(userId)
    assertKey(mark.id)
    assertId(mark.bookId)
    const all = bookmarks(userId).filter((row) => row.id !== mark.id)
    all.push(mark)
    writeJson(path.join(userDir(userId), 'bookmarks.json'), all)
  }

  function deleteBookmark(userId: string, markId: string): void {
    requireUser(userId)
    const key = assertKey(markId)
    writeJson(
      path.join(userDir(userId), 'bookmarks.json'),
      bookmarks(userId).filter((row) => row.id !== key),
    )
  }

  function removeBook(id: string): void {
    const key = assertId(id)
    fs.rmSync(bookDir(key), { recursive: true, force: true })
    if (!fs.existsSync(path.join(root, 'users'))) return
    for (const name of fs.readdirSync(path.join(root, 'users'))) {
      if (!ID_RE.test(name)) continue
      const dir = userDir(name)
      const keptNotes = notes(name).filter((row) => row.bookId !== key)
      const keptMarks = bookmarks(name).filter((row) => row.bookId !== key)
      writeJson(path.join(dir, 'notes.json'), keptNotes)
      writeJson(path.join(dir, 'bookmarks.json'), keptMarks)
      const progress = progressMap(name)
      delete progress[key]
      writeJson(path.join(dir, 'progress.json'), progress)
      const looks = readJson<Record<string, unknown>>(path.join(dir, 'book-looks.json'), {})
      delete looks[key]
      writeJson(path.join(dir, 'book-looks.json'), looks)
    }
  }

  return {
    session,
    requireUser,
    listShelf,
    saveMeta,
    filePath,
    coverPath,
    markCover,
    metaOf,
    saveProgress,
    notes,
    bookmarks,
    putNote,
    deleteNote,
    putBookmark,
    deleteBookmark,
    removeBook,
    prefs(userId: string): unknown {
      requireUser(userId)
      return readJson<unknown>(path.join(userDir(userId), 'prefs.json'), null)
    },
    savePrefs(userId: string, prefs: unknown): void {
      requireUser(userId)
      writeJson(path.join(userDir(userId), 'prefs.json'), prefs)
    },
    bookLook(userId: string, bookId: string): unknown {
      requireUser(userId)
      const id = assertId(bookId)
      const all = readJson<Record<string, unknown>>(path.join(userDir(userId), 'book-looks.json'), {})
      return all[id] ?? null
    },
    saveBookLook(userId: string, bookId: string, look: unknown): void {
      requireUser(userId)
      const id = assertId(bookId)
      if (!metaOf(id)) throw new Error('找不到这本书')
      const all = readJson<Record<string, unknown>>(path.join(userDir(userId), 'book-looks.json'), {})
      all[id] = look
      writeJson(path.join(userDir(userId), 'book-looks.json'), all)
    },
    translator(userId: string): unknown {
      requireUser(userId)
      return readJson<unknown>(path.join(userDir(userId), 'translator.json'), null)
    },
    saveTranslator(userId: string, config: unknown): void {
      requireUser(userId)
      writeJson(path.join(userDir(userId), 'translator.json'), config)
    },
  }
}

export type Hub = ReturnType<typeof createHub>
