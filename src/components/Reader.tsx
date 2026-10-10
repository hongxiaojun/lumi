import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryBook, Prefs, RelocateDetail, TranslatorConfig } from '../types'
import type { Annotation } from '../lib/notes'
import type { Bookmark } from '../lib/bookmarks'
import { createBookmark, isCurrentBookmark } from '../lib/bookmarks'
import { clampFraction } from '../lib/format'
import { resolveParallel } from '../lib/translate/lang'
import { collectSearchYield, isBlankQuery, type SearchHit } from '../lib/searchHits'
import { themeForScript, themeOf } from '../lib/styles'
import { FoliateHost, type ReaderApi } from './FoliateHost'
import { ProgressBar } from './ProgressBar'
import { SettingsPanel } from './SettingsPanel'
import { TocPanel } from './TocPanel'
import { NotesPanel } from './NotesPanel'
import { SearchPanel } from './SearchPanel'
import { BookmarkPanel } from './BookmarkPanel'
import { EngineSheet } from './EngineSheet'

type Props = {
  book: LibraryBook
  prefs: Prefs
  translator: TranslatorConfig
  notes: Annotation[]
  bookmarks: Bookmark[]
  onPrefs: (prefs: Prefs) => void
  onTranslator: (config: TranslatorConfig) => void
  onProgress: (patch: { cfi?: string | null; fraction?: number; parallel?: boolean }) => void
  onCreateAnnotation: (row: Annotation) => void
  onUpdateAnnotation: (row: Annotation) => void
  onDeleteAnnotation: (id: string) => void
  onToggleBookmark: (row: Bookmark) => void
  onDeleteBookmark: (id: string) => void
  onBack: () => void
}

export function Reader({
  book, prefs, translator, notes, bookmarks,
  onPrefs, onTranslator, onProgress,
  onCreateAnnotation, onUpdateAnnotation, onDeleteAnnotation,
  onToggleBookmark, onDeleteBookmark, onBack,
}: Props) {
  const [chrome, setChrome] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [marksOpen, setMarksOpen] = useState(false)
  const [engineOpen, setEngineOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [capped, setCapped] = useState(false)
  const [loc, setLoc] = useState<RelocateDetail>({})
  const [nav, setNav] = useState<ReaderApi | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const hintTimer = useRef<number | null>(null)
  const searchGen = useRef(0)
  const [showHint, setShowHint] = useState(true)
  const theme = themeOf(themeForScript(prefs.theme, book.language === 'en' ? 'en' : 'zh'))
  const file = useMemo(() => book.file, [book.file])
  const parallel = resolveParallel(book)
  const readerPrefs = useMemo(() => ({ ...prefs, parallel }), [prefs, parallel])
  const overlay = tocOpen || settingsOpen || notesOpen || engineOpen || searchOpen || marksOpen
  const hereCfi = loc.cfi ?? book.cfi
  const markedHere = isCurrentBookmark(bookmarks, book.id, hereCfi)

  useEffect(() => {
    const toggle = () => {
      setChrome((v) => !v)
      setTocOpen(false)
      setSettingsOpen(false)
      setNotesOpen(false)
      setEngineOpen(false)
      setSearchOpen(false)
      setMarksOpen(false)
    }
    window.addEventListener('leaf:toggle-chrome', toggle)
    return () => window.removeEventListener('leaf:toggle-chrome', toggle)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setTocOpen(false)
        setSettingsOpen(false)
        setNotesOpen(false)
        setEngineOpen(false)
        setMarksOpen(false)
        setSearchOpen(true)
        setChrome(true)
        return
      }
      if (typing) return
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        nav?.goLeft()
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        nav?.goRight()
      } else if (e.key === 'Escape') {
        if (overlay) {
          setTocOpen(false)
          setSettingsOpen(false)
          setNotesOpen(false)
          setEngineOpen(false)
          setSearchOpen(false)
          setMarksOpen(false)
          nav?.clearSearch()
        } else onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, overlay, onBack])

  useEffect(() => {
    hintTimer.current = window.setTimeout(() => setShowHint(false), 3200)
    return () => {
      if (hintTimer.current) window.clearTimeout(hintTimer.current)
    }
  }, [])

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    meta?.setAttribute('content', theme.bg)
    document.documentElement.style.background = theme.bg
    document.body.style.background = theme.bg
    return () => {
      if (previous) meta?.setAttribute('content', previous)
      document.documentElement.style.background = ''
      document.body.style.background = ''
    }
  }, [theme.bg])

  useEffect(() => {
    if (!chrome || overlay) return
    if (!window.matchMedia('(hover: none)').matches) return
    const timer = window.setTimeout(() => setChrome(false), 4000)
    return () => window.clearTimeout(timer)
  }, [chrome, overlay])

  const chapter = loc.tocItem?.label ?? ''
  const fraction = clampFraction(loc.fraction ?? book.fraction)

  function closePanels() {
    setTocOpen(false)
    setSettingsOpen(false)
    setNotesOpen(false)
    setEngineOpen(false)
    setSearchOpen(false)
    setMarksOpen(false)
    nav?.clearSearch()
  }

  function toggleHere() {
    if (!hereCfi) return
    onToggleBookmark(createBookmark({ bookId: book.id, cfi: hereCfi, label: chapter }))
  }

  const runSearch = useCallback(async (query: string) => {
    const token = (searchGen.current += 1)
    nav?.clearSearch()
    if (!nav || isBlankQuery(query)) {
      setHits([])
      setSearching(false)
      setCapped(false)
      return
    }
    setSearching(true)
    setCapped(false)
    let acc: SearchHit[] = []
    try {
      for await (const event of nav.search(query)) {
        if (token !== searchGen.current) return
        const step = collectSearchYield(acc, event)
        acc = step.hits
        setHits(acc)
        setCapped(step.capped)
        if (step.done || step.capped) break
      }
    } finally {
      if (token === searchGen.current) setSearching(false)
    }
  }, [nav])

  return (
    <div
      className={chrome ? 'reader tools' : 'reader'}
      style={{
        background: theme.bg,
        color: theme.fg,
        ['--reader-bg' as string]: theme.bg,
        ['--reader-fg' as string]: theme.fg,
        ['--reader-muted' as string]: theme.muted,
      }}
    >
      <FoliateHost
        file={file}
        cfi={book.cfi}
        bookId={book.id}
        language={book.language}
        prefs={readerPrefs}
        translator={translator}
        annotations={notes}
        onReady={setNav}
        onStatus={setStatus}
        onUpdateAnnotation={onUpdateAnnotation}
        onOpenFailed={(msg) => {
          setStatus(msg)
          setChrome(true)
        }}
        onCreateAnnotation={onCreateAnnotation}
        onRequestNote={(row) => {
          onCreateAnnotation(row)
          setNotesOpen(true)
          setChrome(true)
        }}
        onRelocate={(detail) => {
          setLoc(detail)
          onProgress({
            cfi: detail.cfi ?? null,
            fraction: detail.fraction ?? 0,
          })
        }}
      />

      {chrome && (
        <div className="chrome top">
          <button className="icon-btn" onClick={onBack}>返回</button>
          <div className="chrome-title">{book.title}</div>
          <button
            className={`icon-btn ${parallel ? 'on' : ''}`}
            onClick={() => onProgress({ parallel: !parallel })}
          >
            对照
          </button>
          <button className="icon-btn" onClick={() => { closePanels(); setNotesOpen((v) => !v) }}>
            笔记
          </button>
          <button
            className={`icon-btn ${markedHere ? 'on' : ''}`}
            onClick={() => { closePanels(); setMarksOpen(true) }}
          >
            书签
          </button>
          <button className="icon-btn" onClick={() => {
            setTocOpen(false)
            setSettingsOpen(false)
            setNotesOpen(false)
            setEngineOpen(false)
            setSearchOpen(true)
          }}>
            搜索
          </button>
          <button className="icon-btn" onClick={() => { closePanels(); setTocOpen((v) => !v) }}>
            目录
          </button>
        </div>
      )}

      {chrome && (
        <div className="chrome bottom">
          <div className="chrome-row">
            <button className="icon-btn" onClick={() => nav?.goLeft()}>上一页</button>
            <button className="icon-btn" onClick={() => nav?.goRight()}>下一页</button>
            <span className="chrome-spacer" />
            <button className="icon-btn" onClick={() => { closePanels(); setEngineOpen(true) }}>
              引擎
            </button>
            <button className="icon-btn" onClick={() => { closePanels(); setSettingsOpen((v) => !v) }}>
              设置
            </button>
          </div>
        </div>
      )}

      <ProgressBar
        fraction={fraction}
        chapter={chapter}
        onSeek={(next) => nav?.goToFraction(next)}
      />

      {overlay && (
        <div className="dim" onClick={() => closePanels()} />
      )}
      {searchOpen && (
        <SearchPanel
          hits={hits}
          searching={searching}
          capped={capped}
          onQuery={runSearch}
          onJump={(cfi) => { nav?.goTo(cfi) }}
          onClose={() => { setSearchOpen(false); nav?.clearSearch() }}
        />
      )}
      {tocOpen && (
        <TocPanel
          items={nav?.toc ?? []}
          onJump={(href) => { nav?.goTo(href); closePanels(); setChrome(false) }}
          onClose={() => setTocOpen(false)}
        />
      )}
      {marksOpen && (
        <BookmarkPanel
          marks={bookmarks}
          current={markedHere}
          onToggleHere={toggleHere}
          onJump={(cfi) => { nav?.goTo(cfi); setMarksOpen(false) }}
          onRemove={onDeleteBookmark}
          onClose={() => setMarksOpen(false)}
        />
      )}
      {notesOpen && (
        <NotesPanel
          notes={notes}
          onJump={(cfi) => { nav?.goTo(cfi); setNotesOpen(false) }}
          onRemove={onDeleteAnnotation}
          onChangeNote={(row, note) => onUpdateAnnotation({ ...row, note })}
          onChangeColor={(row, color) => onUpdateAnnotation({ ...row, color })}
          onClose={() => setNotesOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel prefs={prefs} onChange={onPrefs} onClose={() => setSettingsOpen(false)} />
      )}
      {engineOpen && (
        <EngineSheet config={translator} onChange={onTranslator} onClose={() => setEngineOpen(false)} />
      )}
      {showHint && !chrome && (
        <div className="hint">
          {window.matchMedia('(hover: none)').matches
            ? '点左右翻页 · 点中间显示工具 · 点页面空白可收起 Safari 地址栏'
            : '滚轮翻页 · 章末继续滚进入下一章 · 点中间显示工具栏'}
        </div>
      )}
      {status && <div className="status-toast">{status}</div>}
    </div>
  )
}
