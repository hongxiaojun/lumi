import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryBook, Prefs, TranslatorConfig } from './types'
import type { Annotation } from './lib/notes'
import { mergeAnnotation } from './lib/notes'
import type { Bookmark } from './lib/bookmarks'
import { toggleBookmark } from './lib/bookmarks'
import {
  deleteAnnotation,
  deleteBook,
  getBook,
  deleteBookmark,
  listAnnotations,
  listBookmarks,
  listBooks,
  loadLocalBookLook,
  loadPrefs,
  loadTranslator,
  putAnnotation,
  putBookmark,
  migrateLegacyBooks,
  putBook,
  saveLocalBookLook,
  saveTranslator,
} from './lib/db'
import { importMany, seedSampleIfEmpty } from './lib/importBook'
import { catalogFromBooks, ensureAiDatabase, rebuildCatalog } from './lib/aiDb/build'
import { removeAiBook } from './lib/aiDb/persist'
import {
  deleteSharedBookmark,
  deleteSharedNote,
  ensureDevice,
  importToHub,
  listShelf,
  loadSharedBookmarks,
  loadSharedNotes,
  loadBookLook,
  loadSharedPrefs,
  loadSharedTranslator,
  openSharedBook,
  probeHub,
  publishLocalBooks,
  removeSharedBook,
  saveBookLook,
  saveSharedBookmark,
  saveSharedMeta,
  saveSharedNote,
  saveSharedProgress,
  saveSharedTranslator,
  seedHubIfEmpty,
} from './lib/hub/client'
import { prefsWithLook } from './lib/bookLook'
import { DEFAULT_PREFS } from './lib/styles'
import { DEFAULT_SECRETS } from './lib/translate/engines'
import { Library } from './components/Library'
import { Reader } from './components/Reader'

export default function App() {
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [openId, setOpenId] = useState<string | null>(null)
  const [current, setCurrent] = useState<LibraryBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [translator, setTranslator] = useState<TranslatorConfig>({
    engine: 'google',
    direction: 'auto',
    secrets: DEFAULT_SECRETS,
  })
  const [notes, setNotes] = useState<Annotation[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [account, setAccount] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const progressTimer = useRef<number | null>(null)
  const hubOn = useRef(false)
  const deviceId = useRef<string | null>(null)
  const templateRef = useRef<Prefs>(DEFAULT_PREFS)
  const handleImportRef = useRef<(files: FileList | File[]) => Promise<void>>(async () => {})

  const refresh = useCallback(async () => {
    const rows = hubOn.current && deviceId.current ? await listShelf(deviceId.current) : await listBooks()
    setBooks(rows)
    return rows
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        try {
          await migrateLegacyBooks()
        } catch (migrateError) {
          console.error('M10-3 migrateLegacyBooks', migrateError)
        }
        const on = await probeHub()
        hubOn.current = on
        if (!on) {
          setError('没有连上这台 Mac 的书库。请用 Safari 新建标签打开 http://10.10.10.20:5173/ ，不要用之前那个页面。')
          const localPrefs = await loadPrefs()
          templateRef.current = localPrefs
          setPrefs(localPrefs)
          setTranslator(await loadTranslator())
          const rows = await refresh()
          await seedSampleIfEmpty(rows.length)
          await refresh()
          return
        }
        const device = await ensureDevice()
        deviceId.current = device.id
        setAccount(device.name)
        await refresh()
        const storedPrefs = await loadSharedPrefs(device.id)
        const storedTranslator = await loadSharedTranslator(device.id)
        const template = storedPrefs ? { ...DEFAULT_PREFS, ...storedPrefs } : DEFAULT_PREFS
        templateRef.current = template
        setPrefs(template)
        if (storedTranslator) {
          setTranslator({
            engine: storedTranslator.engine ?? 'google',
            direction: storedTranslator.direction ?? 'auto',
            secrets: { ...DEFAULT_SECRETS, ...storedTranslator.secrets },
          })
        }
        await publishLocalBooks(device.id)
        await seedHubIfEmpty(device.id)
        await refresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : '书库没有读出来'
        setError(`书库没有读出来：${message}。请新建标签打开 http://10.10.10.20:5173/`)
      } finally {
        setBooting(false)
      }
    })()
  }, [refresh])

  useEffect(() => {
    if (booting) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void (async () => {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
      try {
        const {
          formatUnsupportedTip,
          loadOpenedFiles,
          subscribeOpenedFiles,
          subscribeRejectedOpens,
          takeAndLoadOpenedFiles,
        } = await import('./lib/openFiles')
        const ingest = async (items: { token: string; name: string }[]) => {
          if (!items.length || cancelled) return
          const { files, errors } = await loadOpenedFiles(items)
          if (cancelled) return
          if (files.length) await handleImportRef.current(files)
          if (errors.length) setError((prev) => (prev ? `${prev}\n${errors.join('\n')}` : errors.join('\n')))
        }
        const unRejected = await subscribeRejectedOpens((names) => {
          if (cancelled || !names.length) return
          const tip = formatUnsupportedTip(names)
          setError((prev) => (prev ? `${prev}\n${tip}` : tip))
        })
        // Listen first, then drain pending — avoids dropping a cold-start batch.
        const unOpen = await subscribeOpenedFiles((items) => {
          void ingest(items)
        })
        unlisten = () => {
          unRejected()
          unOpen()
        }

        if (cancelled) {
          unlisten()
          return
        }
        const drained = await takeAndLoadOpenedFiles()
        if (cancelled) return
        if (drained.files.length) await handleImportRef.current(drained.files)
        if (drained.errors.length) {
          setError((prev) =>
            prev ? `${prev}\n${drained.errors.join('\n')}` : drained.errors.join('\n'),
          )
        }
      } catch (error) {
        console.error('M12-2 openFiles', error)
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [booting])

  useEffect(() => {
    if (!openId) {
      setCurrent(null)
      return
    }
    const user = deviceId.current
    if (hubOn.current && user) {
      void openSharedBook(user, openId).then((book) => setCurrent(book))
      void loadSharedNotes(user, openId).then(setNotes)
      void loadSharedBookmarks(user, openId).then(setBookmarks)
      return
    }
    void getBook(openId).then((book) => setCurrent(book ?? null))
    void listAnnotations(openId).then(setNotes)
    void listBookmarks(openId).then(setBookmarks)
  }, [openId])

  async function handleImport(files: FileList | File[]) {
    setError(null)
    const user = deviceId.current
    const reasons =
      hubOn.current && user ? await importToHub(user, Array.from(files)) : await importMany(Array.from(files))
    await refresh()
    if (reasons.length) setError(reasons.join('\n'))
  }

  useEffect(() => {
    handleImportRef.current = handleImport
  })

  async function handleRemove(id: string) {
    const book = books.find((row) => row.id === id) ?? (await getBook(id))
    if (hubOn.current) await removeSharedBook(id)
    else await deleteBook(id)
    if (openId === id) setOpenId(null)
    const rows = await refresh()
    try {
      if (book?.aiSlug) await removeAiBook(book.aiSlug, catalogFromBooks(rows))
      else await rebuildCatalog(rows)
    } catch {
      // disk catalog is best-effort
    }
  }

  async function handleOpen(id: string) {
    const user = deviceId.current
    const book = hubOn.current && user ? await openSharedBook(user, id) : await getBook(id)
    if (!book) return
    book.lastOpenedAt = Date.now()
    if (hubOn.current && user) await saveSharedProgress(user, book)
    else await putBook(book)
    const look = hubOn.current && user ? await loadBookLook(user, id) : await loadLocalBookLook(id)
    setPrefs(prefsWithLook(templateRef.current, look))
    setCurrent(book)
    setOpenId(id)
    await refresh()
    void ensureAiDatabase(book, hubOn.current ? books : undefined)
      .then(async (next) => {
        if (hubOn.current && user) await saveSharedMeta(user, next)
        setCurrent((cur) => (cur && cur.id === next.id ? { ...cur, ...next, file: cur.file } : cur))
        return refresh()
      })
      .catch(() => {})
  }

  async function handlePrefs(next: Prefs) {
    setPrefs(next)
    const id = openId
    if (!id) return
    const user = deviceId.current
    if (hubOn.current && user) await saveBookLook(user, id, next)
    else await saveLocalBookLook(id, next)
  }

  function handleProgress(patch: { cfi?: string | null; fraction?: number; parallel?: boolean }) {
    setCurrent((cur) => {
      if (!cur) return cur
      const next = { ...cur, ...patch, lastOpenedAt: Date.now() }
      if (progressTimer.current) window.clearTimeout(progressTimer.current)
      progressTimer.current = window.setTimeout(() => {
        const user = deviceId.current
        if (hubOn.current && user) void saveSharedProgress(user, next)
        else void putBook(next)
      }, 400)
      return next
    })
  }

  async function handleTranslator(next: TranslatorConfig) {
    setTranslator(next)
    const user = deviceId.current
    if (hubOn.current && user) await saveSharedTranslator(user, next)
    else await saveTranslator(next)
  }

  async function handleCreateNote(row: Annotation) {
    let saved = row
    setNotes((cur) => {
      const next = mergeAnnotation(cur, row)
      saved = next.find((item) => item.bookId === row.bookId && item.cfi === row.cfi) ?? row
      return next
    })
    const user = deviceId.current
    if (hubOn.current && user) await saveSharedNote(user, saved)
    else await putAnnotation(saved)
  }

  async function handleUpdateNote(row: Annotation) {
    setNotes((cur) => cur.map((n) => (n.id === row.id ? row : n)))
    const user = deviceId.current
    if (hubOn.current && user) await saveSharedNote(user, row)
    else await putAnnotation(row)
  }

  async function handleDeleteNote(id: string) {
    setNotes((cur) => cur.filter((n) => n.id !== id))
    const user = deviceId.current
    if (hubOn.current && user) await deleteSharedNote(user, id)
    else await deleteAnnotation(id)
  }

  async function handleToggleBookmark(mark: Bookmark) {
    setBookmarks((cur) => {
      const existing = cur.find((row) => row.bookId === mark.bookId && row.cfi === mark.cfi)
      const { list, added } = toggleBookmark(cur, mark)
      const user = deviceId.current
      if (hubOn.current && user) {
        if (added) void saveSharedBookmark(user, mark)
        else if (existing) void deleteSharedBookmark(user, existing.id)
      } else if (added) void putBookmark(mark)
      else if (existing) void deleteBookmark(existing.id)
      return list
    })
  }

  async function handleDeleteBookmark(id: string) {
    setBookmarks((cur) => cur.filter((row) => row.id !== id))
    const user = deviceId.current
    if (hubOn.current && user) await deleteSharedBookmark(user, id)
    else await deleteBookmark(id)
  }

  if (current) {
    return (
      <Reader
        book={current}
        prefs={prefs}
        translator={translator}
        notes={notes}
        bookmarks={bookmarks}
        onPrefs={handlePrefs}
        onTranslator={handleTranslator}
        onProgress={handleProgress}
        onCreateAnnotation={handleCreateNote}
        onUpdateAnnotation={handleUpdateNote}
        onDeleteAnnotation={handleDeleteNote}
        onToggleBookmark={handleToggleBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onBack={() => {
          setOpenId(null)
          void refresh()
        }}
      />
    )
  }

  return (
    <Library
      books={books}
      account={account}
      loading={booting}
      notice={error}
      onDismissNotice={() => setError(null)}
      onOpen={handleOpen}
      onImport={handleImport}
      onRemove={handleRemove}
    />
  )
}
