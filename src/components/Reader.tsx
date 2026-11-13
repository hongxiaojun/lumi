import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LibraryBook, Prefs, RelocateDetail, TranslatorConfig, TtsConfig } from '../types'
import type { Annotation } from '../lib/notes'
import type { Bookmark } from '../lib/bookmarks'
import { createBookmark, isCurrentBookmark } from '../lib/bookmarks'
import { saveTtsPosition } from '../lib/db'
import { armSleep, bindSleepPause } from '../lib/tts/sleepTimer'
import type { ListenChrome } from '../lib/tts/listenChrome'
import { clampFraction } from '../lib/format'
import { resolveParallel } from '../lib/translate/lang'
import { collectSearchYield, isBlankQuery, type SearchHit } from '../lib/searchHits'
import { subscribeOpenFrame } from '../lib/edgeChapter'
import { clampSidebar, panelPlace, SIDEBAR_DEFAULT, sidebarAfterDrag, sidebarBand, type SidebarSide } from '../lib/readerSplit'
import { themeForScript, themeOf } from '../lib/styles'
import { menuShown, menusPinnedOnOpen, pageMenuPinned, pointerHoldsMenu } from '../lib/menuChrome'
import { listenFabMode } from '../lib/tts/listenFab'
import { keyboardInset } from '../lib/keyboardInset'
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
import { ListenBar } from './ListenBar'
import { ListenFab } from './ListenFab'
import type { ShelfPlayback } from '../lib/shelfListen'
import {
  artworkOf,
  bindLockActions,
  clearLockCard,
  clipClock,
  lockCopy,
  showLockCard,
  showLockClock,
  type LockArtwork,
} from '../lib/tts/nowPlaying'
import { VoiceSheet } from './VoiceSheet'
import { useReadAloud } from './useReadAloud'
import type { UserFontChoice } from './UserFontsPanel'

type Props = {
  book: LibraryBook
  prefs: Prefs
  userFonts: UserFontChoice[]
  translator: TranslatorConfig
  tts: TtsConfig
  notes: Annotation[]
  bookmarks: Bookmark[]
  onPrefs: (prefs: Prefs) => void
  onTranslator: (config: TranslatorConfig) => void
  onTts: (patch: Partial<TtsConfig>) => void
  onProgress: (patch: { cfi?: string | null; fraction?: number; parallel?: boolean }) => void
  onCreateAnnotation: (row: Annotation) => void
  onUpdateAnnotation: (row: Annotation) => void
  onDeleteAnnotation: (id: string) => void
  onToggleBookmark: (row: Bookmark) => void
  onDeleteBookmark: (id: string) => void
  onBack: () => void
  autoListen?: boolean
  listenResume?: { cfi?: string | null; fraction?: number } | null
  onListenStarted?: () => void
  /** Shelf keeps this reader laid out but not shown. Skip painting the page color onto the document. */
  backstage?: boolean
  onPlayback?: (next: ShelfPlayback | null) => void
  bindListenToggle?: (toggle: (() => void) | null) => void
}

export function Reader({
  book, prefs, userFonts, translator, tts, notes, bookmarks,
  onPrefs, onTranslator, onTts, onProgress,
  onCreateAnnotation, onUpdateAnnotation, onDeleteAnnotation,
  onToggleBookmark, onDeleteBookmark, onBack,
  autoListen = false, listenResume = null, onListenStarted,
  backstage = false, onPlayback, bindListenToggle,
}: Props) {
  const [atMenu, setAtMenu] = useState(false)
  const [atFoot, setAtFoot] = useState(false)
  const [pinned, setPinned] = useState(() => menusPinnedOnOpen(window.matchMedia('(hover: none)').matches))
  const [lineFoot, setLineFoot] = useState<FootLabel | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [marksOpen, setMarksOpen] = useState(false)
  const [engineOpen, setEngineOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [capped, setCapped] = useState(false)
  const [loc, setLoc] = useState<RelocateDetail>({})
  const [nav, setNav] = useState<ReaderApi | null>(null)
  const listen = useReadAloud({ nav, tts })
  const startListening = listen.start
  const listening = listen.active && tts.listenLayout
  const listenStyle = useMemo(
    () => (listening ? { size: tts.listenFontSize, leading: tts.listenLineHeight } : null),
    [listening, tts.listenFontSize, tts.listenLineHeight],
  )
  const autoListenDone = useRef(false)
  bindListenToggle?.(listen.toggle)
  const listenRef = useRef(listen)
  listenRef.current = listen
  const listenWasActive = useRef(false)
  useEffect(() => {
    bindSleepPause(() => listenRef.current.pause())
    return () => bindSleepPause(null)
  }, [])
  useEffect(() => {
    if (listen.active) {
      listenWasActive.current = true
      return
    }
    if (!listenWasActive.current) return
    listenWasActive.current = false
    armSleep(null)
  }, [listen.active])
  const lockArt = useRef<LockArtwork[]>([])
  const quietProgressUntil = useRef(0)
  const [status, setStatusText] = useState<string | null>(null)
  const [statusTick, setStatusTick] = useState(0)
  const setStatus = useCallback((message: string | null) => {
    setStatusText(message)
    setStatusTick((n) => n + 1)
  }, [])
  const hintTimer = useRef<number | null>(null)
  const searchGen = useRef(0)
  const [showHint, setShowHint] = useState(true)
  const [listenChrome, setListenChrome] = useState<ListenChrome>('open')
  const [sidebarWanted, setSidebarWanted] = useState(SIDEBAR_DEFAULT)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  const [kbInset, setKbInset] = useState(0)
  const readerRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; width: number } | null>(null)
  const theme = themeOf(themeForScript(prefs.theme, book.language === 'en' ? 'en' : 'zh'))
  const file = useMemo(() => book.file, [book.file])
  const parallel = resolveParallel(book)
  const readerPrefs = useMemo(() => ({ ...prefs, parallel }), [prefs, parallel])
  const overlay = tocOpen || settingsOpen || notesOpen || engineOpen || searchOpen || marksOpen || voiceOpen
  const shown = menuShown({ pointer: atMenu, pinned, panel: overlay })
  const coarse = window.matchMedia('(hover: none)').matches
  const footShown = atFoot || (coarse && shown)
  const sheet = settingsOpen || engineOpen || voiceOpen
  const overlayRef = useRef(false)
  const pinnedRef = useRef(false)
  const navRef = useRef(nav)
  overlayRef.current = overlay
  pinnedRef.current = pinned
  navRef.current = nav
  const place = panelPlace(viewport)
  const side: SidebarSide = place === 'sheet'
    ? 'none'
    : notesOpen ? 'right' : (tocOpen || searchOpen || marksOpen) ? 'left' : 'none'
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
    const view = window.visualViewport
    if (!view) return
    const measure = () => setKbInset(keyboardInset(window.innerHeight, view.height, view.offsetTop))
    measure()
    view.addEventListener('resize', measure)
    view.addEventListener('scroll', measure)
    return () => {
      view.removeEventListener('resize', measure)
      view.removeEventListener('scroll', measure)
    }
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
    onPlayback?.({
      bookId: book.id,
      active: listen.active,
      phase: listen.phase,
      text: listen.text,
      error: listen.error,
    })
  }, [book.id, listen.active, listen.phase, listen.text, listen.error, onPlayback])

  useEffect(() => () => {
    onPlayback?.(null)
    bindListenToggle?.(null)
    clearLockCard()
  }, [onPlayback, bindListenToggle])

  useEffect(() => bindLockActions({
    play: () => {
      const view = listenRef.current
      if (view.phase !== 'playing' && view.phase !== 'loading') view.toggle()
    },
    pause: () => {
      const view = listenRef.current
      if (view.phase === 'playing' || view.phase === 'loading') view.toggle()
    },
    skip: (seconds) => listenRef.current.skip(seconds),
    previous: () => listenRef.current.segment(-1),
    next: () => listenRef.current.segment(1),
  }), [])

  useEffect(() => {
    if (!listen.active) {
      clearLockCard()
      return
    }
    const copy = lockCopy({ title: book.title, author: book.author, sentence: listen.text })
    const paused = listen.phase === 'paused' || listen.phase === 'done' || listen.phase === 'error'
    let cancelled = false
    const pushClock = () => {
      const clock = clipClock(
        listenRef.current.place().position,
        listenRef.current.place().duration,
        listenRef.current.place().estimate,
      )
      if (clock) showLockClock(clock.position, clock.duration, paused)
    }
    showLockCard({ ...copy, artwork: lockArt.current, paused })
    pushClock()
    void artworkOf(book.cover, book.coverUrl).then((artwork) => {
      if (cancelled || !listenRef.current.active) return
      lockArt.current = artwork
      showLockCard({ ...copy, artwork, paused })
    })
    const timer = window.setInterval(pushClock, 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    listen.active, listen.phase, listen.text,
    book.title, book.author, book.cover, book.coverUrl,
  ])

  useEffect(() => {
    if (backstage) return
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
  }, [theme.bg, backstage])

  useEffect(() => {
    if (!autoListen) {
      autoListenDone.current = false
      return
    }
    if (!nav || autoListenDone.current) return
    if (loc.cfi == null && loc.fraction == null) return
    autoListenDone.current = true
    onListenStarted?.()
    if (listenResume?.cfi || typeof listenResume?.fraction === 'number') {
      quietProgressUntil.current = Date.now() + 6000
      void (async () => {
        if (listenResume.cfi) await nav.goTo(listenResume.cfi)
        else await nav.goToFraction(listenResume.fraction ?? 0)
        startListening(nav.currentRange())
      })()
      return
    }
    startListening(loc.range ?? null)
  }, [
    autoListen, nav, loc.cfi, loc.fraction, loc.range,
    listenResume, onListenStarted, startListening,
  ])

  const chapter = loc.tocItem?.label ?? ''
  const fraction = clampFraction(loc.fraction ?? book.fraction)

  function closePanels() {
    setTocOpen(false)
    setSettingsOpen(false)
    setNotesOpen(false)
    setEngineOpen(false)
    setVoiceOpen(false)
    setSearchOpen(false)
    setMarksOpen(false)
    nav?.clearSearch()
  }

  function stopListening() {
    void saveTtsPosition(book.id, { cfi: loc.cfi, fraction: loc.fraction })
    // iOS reflows the page after the bar closes; give that relocate room so it
    // cannot write the spoken page into the reading position.
    quietProgressUntil.current = Date.now() + 6000
    listen.stop()
  }

  function openListen() {
    if (listen.active) {
      setListenChrome('open')
      return
    }
    closePanels()
    setListenChrome('open')
    startListening(loc.range ?? null)
  }

  function toggleListen() {
    if (listen.active) {
      stopListening()
      return
    }
    openListen()
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
  const fabMode = listenFabMode({ active: listen.active, chrome: listenChrome, phase: listen.phase })

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
        ['--keyboard-inset' as string]: `${kbInset}px`,
      }}
    >
      {place === 'column' && side === 'left' && searchOpen && (
        <SearchPanel
          hits={hits}
          searching={searching}
          capped={capped}
          onQuery={runSearch}
          onJump={(cfi) => { nav?.goTo(cfi) }}
          onClose={() => { setSearchOpen(false); nav?.clearSearch() }}
        />
      )}
      {place === 'column' && side === 'left' && tocOpen && (
        <TocPanel
          items={nav?.toc ?? []}
          onJump={(href) => { nav?.goTo(href); closePanels() }}
          onClose={() => setTocOpen(false)}
        />
      )}
      {place === 'column' && side === 'left' && marksOpen && (
        <BookmarkPanel
          marks={bookmarks}
          current={markedHere}
          onToggleHere={toggleHere}
          onJump={(cfi) => { nav?.goTo(cfi); setMarksOpen(false) }}
          onRemove={onDeleteBookmark}
          onClose={() => setMarksOpen(false)}
        />
      )}

      <div className={[
        'reader-main',
        footShown ? 'foot' : '',
        listen.active ? 'listening' : '',
        listen.active && listenChrome === 'mini' ? 'listening-mini' : '',
        listen.active && listenChrome === 'hidden' ? 'listening-hidden' : '',
      ].filter(Boolean).join(' ')}>
        <FoliateHost
          file={file}
          listening={listening}
          listenStyle={listenStyle}
          immersive={listening && tts.immersive}
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
            if (listen.active) {
              void saveTtsPosition(book.id, { cfi: detail.cfi, fraction: detail.fraction })
              listen.repaint()
              return
            }
            if (Date.now() < quietProgressUntil.current) return
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
              ? prefs.flow === 'scrolled'
                ? '上下滑动阅读 · 点页面显示菜单 · 按住一段文字可以划线'
                : '左右拨动翻页 · 点页面显示菜单 · 按住一段文字可以划线'
              : prefs.flow === 'scrolled'
                ? '滚动阅读 · 章末继续滚进入下一章 · 鼠标移到页面上沿显示菜单'
                : '拨动或点页边翻页 · 鼠标移到页面上沿显示菜单'}
          </div>
        )}
        {status && <div className="status-toast">{status}</div>}
        {listen.active && !voiceOpen && (
          <ListenBar
            view={listen}
            rate={tts.rate}
            chrome={listenChrome}
            onChrome={setListenChrome}
            onRate={(rate) => onTts({ rate })}
            onVoice={() => setVoiceOpen(true)}
          />
        )}
        {fabMode !== 'off' && <ListenFab mode={fabMode} onPress={openListen} />}
      </div>

      {place === 'column' && side === 'right' && notesOpen && (
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

      {(sheet || (place === 'sheet' && side === 'none' && (tocOpen || searchOpen || marksOpen || notesOpen))) && (
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
        listenOn={listen.active}
        onPointer={setAtMenu}
        onBack={onBack}
        onToc={() => showPanel('toc')}
        onMarks={() => showPanel('marks')}
        onNotes={() => showPanel('notes')}
        onSize={() => showPanel('settings')}
        onSearch={() => showPanel('search')}
        onListen={toggleListen}
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
          onVoice={() => {
            setSettingsOpen(false)
            setVoiceOpen(true)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {place === 'sheet' && tocOpen && (
        <TocPanel
          items={nav?.toc ?? []}
          onJump={(href) => { nav?.goTo(href); closePanels() }}
          onClose={() => setTocOpen(false)}
        />
      )}
      {place === 'sheet' && searchOpen && (
        <SearchPanel
          hits={hits}
          searching={searching}
          capped={capped}
          onQuery={runSearch}
          onJump={(cfi) => { nav?.goTo(cfi) }}
          onClose={() => { setSearchOpen(false); nav?.clearSearch() }}
        />
      )}
      {place === 'sheet' && marksOpen && (
        <BookmarkPanel
          marks={bookmarks}
          current={markedHere}
          onToggleHere={toggleHere}
          onJump={(cfi) => { nav?.goTo(cfi); setMarksOpen(false) }}
          onRemove={onDeleteBookmark}
          onClose={() => setMarksOpen(false)}
        />
      )}
      {place === 'sheet' && notesOpen && (
        <NotesPanel
          notes={notes}
          onJump={(cfi) => { nav?.goTo(cfi); setNotesOpen(false) }}
          onRemove={onDeleteAnnotation}
          onChangeNote={(row, note) => onUpdateAnnotation({ ...row, note })}
          onChangeColor={(row, color) => onUpdateAnnotation({ ...row, color })}
          onClose={() => setNotesOpen(false)}
        />
      )}
      {engineOpen && (
        <EngineSheet config={translator} onChange={onTranslator} onClose={() => setEngineOpen(false)} />
      )}
      {voiceOpen && (
        <VoiceSheet config={tts} onChange={onTts} onClose={() => setVoiceOpen(false)} />
      )}
    </div>
  )
}
