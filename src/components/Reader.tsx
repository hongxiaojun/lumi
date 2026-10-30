import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LibraryBook, Prefs, RelocateDetail, TranslatorConfig } from '../types'
import type { Annotation } from '../lib/notes'
import type { Bookmark } from '../lib/bookmarks'
import { createBookmark, isCurrentBookmark } from '../lib/bookmarks'
import { clampFraction } from '../lib/format'
import { resolveParallel } from '../lib/translate/lang'
import { collectSearchYield, isBlankQuery, type SearchHit } from '../lib/searchHits'
import { subscribeOpenFrame } from '../lib/edgeChapter'
import { clampSidebar, SIDEBAR_DEFAULT, sidebarAfterDrag, sidebarBand, type SidebarSide } from '../lib/readerSplit'
import { themeForScript, themeOf } from '../lib/styles'
import { menuShown, pageMenuPinned, pointerHoldsMenu } from '../lib/menuChrome'
import type { FootLabel } from '../lib/pageFoot'
import { FoliateHost, type ReaderApi } from './FoliateHost'
import { BookMenu } from './BookMenu'
import { ProgressBar } from './ProgressBar'
import { SettingsPanel } from './SettingsPanel'
import { TocPanel } from './TocPanel'
import { NotesPanel } from './NotesPanel'
import { SearchPanel } from './SearchPanel'
import { BookmarkPanel } from './BookmarkPanel'
import { EngineSheet } from './EngineSheet'
import type { UserFontChoice } from './UserFontsPanel'

type Props = {
  book: LibraryBook
  prefs: Prefs
  userFonts: UserFontChoice[]
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
  book, prefs, userFonts, translator, notes, bookmarks,
  onPrefs, onTranslator, onProgress,
  onCreateAnnotation, onUpdateAnnotation, onDeleteAnnotation,
  onToggleBookmark, onDeleteBookmark, onBack,
}: Props) {
  const [atMenu, setAtMenu] = useState(false)
  const [atFoot, setAtFoot] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [lineFoot, setLineFoot] = useState<FootLabel | null>(null)
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
  const [status, setStatusText] = useState<string | null>(null)
  const [statusTick, setStatusTick] = useState(0)
  const setStatus = useCallback((message: string | null) => {
    setStatusText(message)
    setStatusTick((n) => n + 1)
  }, [])
  const hintTimer = useRef<number | null>(null)
  const searchGen = useRef(0)
  const [showHint, setShowHint] = useState(true)
  const [sidebarWanted, setSidebarWanted] = useState(SIDEBAR_DEFAULT)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  const readerRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; width: number } | null>(null)
  const theme = themeOf(themeForScript(prefs.theme, book.language === 'en' ? 'en' : 'zh'))
  const file = useMemo(() => book.file, [book.file])
  const parallel = resolveParallel(book)
  const readerPrefs = useMemo(() => ({ ...prefs, parallel }), [prefs, parallel])
  const overlay = tocOpen || settingsOpen || notesOpen || engineOpen || searchOpen || marksOpen
  const shown = menuShown({ pointer: atMenu, pinned, panel: overlay })
  const coarse = window.matchMedia('(hover: none)').matches
  const footShown = atFoot || (coarse && shown)
  const sheet = settingsOpen || engineOpen
  const overlayRef = useRef(false)
  const pinnedRef = useRef(false)
  const navRef = useRef(nav)
  overlayRef.current = overlay
  pinnedRef.current = pinned
  navRef.current = nav
  const side: SidebarSide = notesOpen ? 'right' : (tocOpen || searchOpen || marksOpen) ? 'left' : 'none'
  const sidebarPx = clampSidebar(viewport, sidebarWanted, side)
  const band = sidebarBand(viewport)
  const hereCfi = loc.cfi ?? book.cfi
  const markedHere = isCurrentBookmark(bookmarks, book.id, hereCfi)

  useLayoutEffect(() => {
    const el = readerRef.current
    if (!el) return
    const measure = () => setViewport(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    let stop = () => {}
    void subscribeOpenFrame((message) => {
      if (alive) setStatus(message)
    }).then((unlisten) => {
      if (!alive) unlisten()
      else stop = unlisten
    })
    return () => {
      alive = false
      stop()
    }
  }, [])

  useEffect(() => {
    const toggle = () => {
      const touch = window.matchMedia('(hover: none)').matches
      setPinned(pageMenuPinned({
        touch,
        panel: overlayRef.current,
        pinned: pinnedRef.current,
      }))
      setTocOpen(false)
      setSettingsOpen(false)
      setNotesOpen(false)
      setEngineOpen(false)
      setSearchOpen(false)
      setMarksOpen(false)
      navRef.current?.clearSearch()
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
        return
      }
      if (typing) return
      if (e.target instanceof HTMLElement && e.target.getAttribute('role') === 'separator' && e.key.startsWith('Arrow')) return
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
    if (!status) return
    const timer = window.setTimeout(() => setStatusText(null), 3200)
    return () => window.clearTimeout(timer)
  }, [status, statusTick])

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
    if (!pinned || overlay) return
    if (!window.matchMedia('(hover: none)').matches) return
    const timer = window.setTimeout(() => setPinned(false), 4000)
    return () => window.clearTimeout(timer)
  }, [pinned, overlay])

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

  function showPanel(which: 'toc' | 'notes' | 'marks' | 'search' | 'settings') {
    const opening = !(
      (which === 'toc' && tocOpen)
      || (which === 'notes' && notesOpen)
      || (which === 'marks' && marksOpen)
      || (which === 'search' && searchOpen)
      || (which === 'settings' && settingsOpen)
    )
    setTocOpen(opening && which === 'toc')
    setNotesOpen(opening && which === 'notes')
    setMarksOpen(opening && which === 'marks')
    setSearchOpen(opening && which === 'search')
    setSettingsOpen(opening && which === 'settings')
    setEngineOpen(false)
    if (!(opening && which === 'search')) nav?.clearSearch()
  }

  function toggleHere() {
    if (!hereCfi) return
    onToggleBookmark(createBookmark({ bookId: book.id, cfi: hereCfi, label: chapter }))
  }

  function rememberSidebar(shown: number, dx: number) {
    if (side === 'none') return
    setSidebarWanted((wanted) => sidebarAfterDrag(viewport, side, shown, wanted, dx))
  }

  function onSplitPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (side === 'none' || e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOrigin.current = { x: e.clientX, width: sidebarPx }
  }

  function onSplitPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const origin = dragOrigin.current
    if (!origin) return
    rememberSidebar(origin.width, e.clientX - origin.x)
  }

  function onSplitPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragOrigin.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function onSplitKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const dx = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 16
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -16
      : 0
    if (!dx || side === 'none') return
    e.preventDefault()
    e.stopPropagation()
    const dragging = side
    setSidebarWanted((wanted) => sidebarAfterDrag(viewport, dragging, clampSidebar(viewport, wanted, dragging), wanted, dx))
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

  const splitClass = side === 'left' ? 'reader split-left' : side === 'right' ? 'reader split-right' : 'reader'

  return (
    <div
      ref={readerRef}
      className={splitClass}
      style={{
        background: theme.bg,
        color: theme.fg,
        ['--reader-bg' as string]: theme.bg,
        ['--reader-fg' as string]: theme.fg,
        ['--reader-muted' as string]: theme.muted,
        ['--sidebar' as string]: `${sidebarPx}px`,
      }}
    >
      {side === 'left' && searchOpen && (
        <SearchPanel
          hits={hits}
          searching={searching}
          capped={capped}
          onQuery={runSearch}
          onJump={(cfi) => { nav?.goTo(cfi) }}
          onClose={() => { setSearchOpen(false); nav?.clearSearch() }}
        />
      )}
      {side === 'left' && tocOpen && (
        <TocPanel
          items={nav?.toc ?? []}
          onJump={(href) => { nav?.goTo(href); closePanels() }}
          onClose={() => setTocOpen(false)}
        />
      )}
      {side === 'left' && marksOpen && (
        <BookmarkPanel
          marks={bookmarks}
          current={markedHere}
          onToggleHere={toggleHere}
          onJump={(cfi) => { nav?.goTo(cfi); setMarksOpen(false) }}
          onRemove={onDeleteBookmark}
          onClose={() => setMarksOpen(false)}
        />
      )}

      <div className={footShown ? 'reader-main foot' : 'reader-main'}>
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
            setPinned(true)
          }}
          onCreateAnnotation={onCreateAnnotation}
          onRequestNote={(row) => {
            onCreateAnnotation(row)
            closePanels()
            setNotesOpen(true)
          }}
          onRelocate={(detail) => {
            setLoc(detail)
            onProgress({
              cfi: detail.cfi ?? null,
              fraction: detail.fraction ?? 0,
            })
          }}
          onPageFoot={(line) => {
            setLineFoot((prev) => {
              if (!line && !prev) return prev
              if (line && prev && line.page === prev.page && line.rest === prev.rest) return prev
              return line
            })
          }}
        />

        <div
          className="reader-foot-zone"
          onPointerEnter={(event) => { if (pointerHoldsMenu(event.pointerType)) setAtFoot(true) }}
          onPointerLeave={(event) => { if (pointerHoldsMenu(event.pointerType)) setAtFoot(false) }}
        >
          <ProgressBar
            fraction={fraction}
            chapter={chapter}
            onSeek={(next) => nav?.goToFraction(next)}
          />
        </div>
        {lineFoot && (
          <div className="page-foot">
            <span>{lineFoot.page}</span>
            {lineFoot.rest ? <span className="page-foot-rest">{lineFoot.rest}</span> : null}
          </div>
        )}

        {showHint && !shown && (
          <div className="hint">
            {window.matchMedia('(hover: none)').matches
              ? '点左右页边翻页 · 点页面显示菜单 · 点页面空白可收起 Safari 地址栏'
              : '滚轮翻页 · 章末继续滚进入下一章 · 鼠标移到页面上沿显示菜单 · 点左右页边翻页'}
          </div>
        )}
        {status && <div className="status-toast">{status}</div>}
      </div>

      {side === 'right' && notesOpen && (
        <NotesPanel
          notes={notes}
          onJump={(cfi) => { nav?.goTo(cfi); setNotesOpen(false) }}
          onRemove={onDeleteAnnotation}
          onChangeNote={(row, note) => onUpdateAnnotation({ ...row, note })}
          onChangeColor={(row, color) => onUpdateAnnotation({ ...row, color })}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {side !== 'none' && (
        <div
          className="split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整边栏"
          aria-valuemin={band.min}
          aria-valuemax={band.max}
          aria-valuenow={sidebarPx}
          tabIndex={0}
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={onSplitPointerUp}
          onPointerCancel={onSplitPointerUp}
          onKeyDown={onSplitKey}
        />
      )}

      {sheet && (
        <div className="dim" onClick={() => closePanels()} />
      )}
      <BookMenu
        title={book.title}
        shown={shown}
        marked={markedHere}
        tocOn={tocOpen}
        marksOn={marksOpen}
        notesOn={notesOpen}
        sizeOn={settingsOpen}
        searchOn={searchOpen}
        onPointer={setAtMenu}
        onBack={onBack}
        onToc={() => showPanel('toc')}
        onMarks={() => showPanel('marks')}
        onNotes={() => showPanel('notes')}
        onSize={() => showPanel('settings')}
        onSearch={() => showPanel('search')}
        onMarkHere={toggleHere}
      />
      {settingsOpen && (
        <SettingsPanel
          prefs={prefs}
          userFonts={userFonts}
          parallel={parallel}
          onChange={onPrefs}
          onParallel={(next) => onProgress({ parallel: next })}
          onEngine={() => {
            setSettingsOpen(false)
            setEngineOpen(true)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {engineOpen && (
        <EngineSheet config={translator} onChange={onTranslator} onClose={() => setEngineOpen(false)} />
      )}
    </div>
  )
}
