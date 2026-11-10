import { useEffect, useRef, useState } from 'react'
import type { LibraryBook, TtsConfig } from '../types'
import { shelfMarks } from '../lib/format'
import { featuredBookId, plankRows, plankSize } from '../lib/shelfMotion'
import { parseCaption, parseFractionOf } from '../lib/parseGate'
import {
  emptyIndexCopy,
  shelfMark,
  shelfMarkPhrase,
  readShelfSection,
  sectionCounts,
  writeShelfSection,
  type ShelfSection,
} from '../lib/shelfIndex'
import { shelfRows } from '../lib/shelfQuery'
import { browserShelfStorage, readShelfView, writeShelfView, type ShelfView } from '../lib/shelfView'
import { CoverShelf } from './CoverShelf'
import { ListenShelf } from './ListenShelf'
import { PhoneShelf } from './PhoneShelf'
import { ShelfIndex } from './ShelfIndex'
import { LeafLogo } from './LeafLogo'
import { ParseBar } from './ParseBar'
import { ShelfBook } from './ShelfBook'
import { UserFontsPanel, type UserFontChoice } from './UserFontsPanel'
import { VoiceSheet } from './VoiceSheet'
import '../shelf.css'

type Props = {
  books: LibraryBook[]
  account?: string | null
  loading?: boolean
  notice?: string | null
  parsePending?: { name: string; fraction: number } | null
  parseGates?: Record<string, number>
  onDismissNotice?: () => void
  tts: TtsConfig
  onTts: (patch: Partial<TtsConfig>) => void
  onOpen: (id: string) => void
  onListen: (id: string) => void
  onImport: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  onDrop: (id: string) => void
  userFonts: UserFontChoice[]
  activeFont: string
  fontNotice: string | null
  onAddFonts: (files: File[]) => void
  onApplyFont: (id: string) => void
  onRemoveFont: (id: string) => void
}

export function Library({
  books,
  account,
  loading,
  notice,
  parsePending,
  parseGates,
  tts,
  onTts,
  onDismissNotice,
  onOpen,
  onListen,
  onImport,
  onRemove,
  onDrop,
  userFonts,
  activeFont,
  fontNotice,
  onAddFonts,
  onApplyFont,
  onRemoveFont,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const shelfRef = useRef<HTMLDivElement>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [rowSize, setRowSize] = useState(10)
  const [entered, setEntered] = useState(false)
  const [view, setView] = useState<ShelfView>(() => readShelfView(browserShelfStorage()))
  const [section, setSection] = useState<ShelfSection>(() => readShelfSection(browserShelfStorage()))
  const [fontsOpen, setFontsOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [listenOpen, setListenOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 719px)').matches)
  const rows = shelfRows(books, section, query)
  const shownBooks = rows.books
  const counts = sectionCounts(books)
  const sectionLabel = rows.title
  const continueKicker = section === 'finished' ? '已读完' : '继续阅读'
  const markPhrase = shelfMarkPhrase(section)
  function markBook(id: string) {
    if (shelfMark(section) === 'delete') onRemove(id)
    else onDrop(id)
  }
  const shelfEmpty = shownBooks.length === 0
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const shown = reduceMotion || entered
  const featured = featuredBookId(shownBooks, chosen)
  const featuredBook = shownBooks.find((book) => book.id === featured) ?? null
  const opened = shownBooks.filter((book) => book.lastOpenedAt)
  const recentId = opened.length > 0 ? featuredBookId(opened, null) : null
  const marks = featuredBook ? shelfMarks(featuredBook) : null
  const featuredParsing = featuredBook ? parseFractionOf(parseGates, featuredBook.id) : null
  const turned = shown ? featured : null

  useEffect(() => {
    const media = window.matchMedia('(max-width: 719px)')
    const apply = () => setPhone(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const node = shelfRef.current
    if (!node) return
    const apply = () => setRowSize(plankSize(node.clientWidth))
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => observer.disconnect()
  }, [shelfEmpty, view])

  useEffect(() => {
    if (shelfEmpty || reduceMotion) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [shelfEmpty, reduceMotion])

  useEffect(() => {
    if (!turned) return
    const node = shelfRef.current?.querySelector(`[data-book="${CSS.escape(turned)}"]`)
    node?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [turned, view])

  function takeFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return
    onImport(list)
  }

  function show(next: ShelfView) {
    setView(next)
    writeShelfView(browserShelfStorage(), next)
  }

  function pick(next: ShelfSection) {
    setSection(next)
    setChosen(null)
    writeShelfSection(browserShelfStorage(), next)
  }

  return (
    <div
      className="library"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        takeFiles(event.dataTransfer.files)
      }}
    >
      {phone ? (
        <PhoneShelf
          books={books}
          parseGates={parseGates}
          parsePending={parsePending}
          notice={notice}
          tts={tts}
          onDismissNotice={onDismissNotice}
          onOpen={onOpen}
          onListen={onListen}
          onRemove={onRemove}
          onDrop={onDrop}
          onImport={() => inputRef.current?.click()}
          onFonts={() => setFontsOpen(true)}
          onVoice={() => setVoiceOpen(true)}
        />
      ) : (
        <ShelfIndex section={section} counts={counts} onPick={pick} />
      )}
      <input
        ref={inputRef}
        className="phone-file"
        type="file"
        accept=".epub,.pdf,.mobi,.azw3,.fb2,.txt"
        multiple
        hidden
        onChange={(event) => {
          takeFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {fontsOpen ? (
        <UserFontsPanel
          fonts={userFonts}
          activeFont={activeFont}
          notice={fontNotice}
          onAdd={onAddFonts}
          onApply={onApplyFont}
          onRemove={onRemoveFont}
          onClose={() => setFontsOpen(false)}
        />
      ) : null}
      {voiceOpen ? (
        <div className="voice-layer" role="presentation" onClick={() => setVoiceOpen(false)}>
          <VoiceSheet config={tts} onChange={onTts} onClose={() => setVoiceOpen(false)} />
        </div>
      ) : null}
      {listenOpen ? (
        <div className="voice-layer" role="presentation" onClick={() => setListenOpen(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <header className="panel-head">
              <h3>朗读</h3>
              <button className="icon-btn" type="button" onClick={() => setListenOpen(false)}>
                完成
              </button>
            </header>
            <ListenShelf
              books={books}
              parseGates={parseGates}
              tts={tts}
              heading={false}
              onListen={(id) => {
                setListenOpen(false)
                onListen(id)
              }}
              onVoice={() => {
                setListenOpen(false)
                setVoiceOpen(true)
              }}
            />
          </div>
        </div>
      ) : null}
      <div className="library-main" hidden={phone}>
      <header className="library-head">
        <div className="brand">
          <LeafLogo className="brand-logo" />
          <div className="wordmark">
            Lumi
            <span>激活沉睡的文本</span>
            {account ? <span>{account}</span> : null}
          </div>
        </div>
        <div className="head-actions">
          <div className="shelf-switch" role="group" aria-label="书架展示">
            <button type="button" aria-pressed={view === 'cover'} onClick={() => show('cover')}>
              封面
            </button>
            <button type="button" aria-pressed={view === 'stand'} onClick={() => show('stand')}>
              动态
            </button>
          </div>
          <button className="btn" type="button" onClick={() => setVoiceOpen(true)}>
            朗读设置
          </button>
          <button className="btn" type="button" disabled={loading} onClick={() => setFontsOpen(true)}>
            我的字体
          </button>
          <button className="btn primary" type="button" onClick={() => inputRef.current?.click()}>
            导入书籍
          </button>
        </div>
      </header>

      <div className="shelf-tools" data-wide-shelf="search-listen">
        <input
          className="text-input shelf-search"
          type="search"
          value={query}
          placeholder="搜索书名、作者或文件名"
          aria-label="搜索书架"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button className="btn" type="button" onClick={() => setQuery('')}>
            清除
          </button>
        ) : null}
        <button className="btn" type="button" onClick={() => setListenOpen(true)}>
          朗读
        </button>
      </div>

      {parsePending ? (
        <div className="parse-banner" role="status">
          <p>
            正在解析《{parsePending.name}》
            {' · '}
            {parseCaption(parsePending.fraction)}
          </p>
          <ParseBar fraction={parsePending.fraction} />
        </div>
      ) : null}

      {notice && (
        <div className="import-notice" role="alert">
          <p>{notice}</p>
          <button type="button" onClick={onDismissNotice} aria-label="关闭导入提示">
            关闭
          </button>
        </div>
      )}

      <h1 className="shelf-title">{sectionLabel}</h1>

      {view === 'stand' && featuredBook && marks ? (
        <button
          className="shelf-caption"
          type="button"
          disabled={featuredParsing !== null}
          onClick={() => {
            if (featuredParsing === null) onOpen(featuredBook.id)
          }}
        >
          <div className="kicker">
            {featuredParsing !== null
              ? parseCaption(featuredParsing)
              : featuredBook.id === recentId
                ? continueKicker
                : chosen === featuredBook.id
                  ? '选中的书'
                  : '书架'}
          </div>
          <h2>{featuredBook.title}</h2>
          {featuredBook.author ? <p>{featuredBook.author}</p> : null}
          <p className="book-note">
            上次打开 {marks.opened}
            {' · '}
            {marks.progress === '已经读完' ? '已经阅读' : `阅读进度 ${marks.progress}`}
          </p>
        </button>
      ) : null}

      {books.length === 0 ? (
        <div className="empty">
          <h2>{loading ? '正在读取服务器上的书…' : '书架还是空的'}</h2>
          <p>
            {account
              ? '这本书架在这台服务器上。笔记、书签和阅读进度只属于上面这个设备账号。'
              : '把 EPUB 或 PDF 拖进来，或点右上角导入。试读本会在首次打开时自动放入。'}
          </p>
        </div>
      ) : shownBooks.length === 0 ? (
        <div className="empty">
          <h2>{rows.searching ? '书架上没有这本书。' : emptyIndexCopy(section)}</h2>
        </div>
      ) : (
        view === 'cover' ? (
          <CoverShelf
            books={shownBooks}
            parseGates={parseGates}
            continueKicker={continueKicker}
            removeLabel={markPhrase}
            onOpen={onOpen}
            onRemove={markBook}
          />
        ) : (
          <div className="shelves" ref={shelfRef}>
            {plankRows(shownBooks, rowSize).map((row) => (
              <div className="plank" key={row[0].id}>
                <div className="plank-row">
                  {row.map((book) => (
                    <ShelfBook
                      key={book.id}
                      book={book}
                      open={turned === book.id}
                      parsing={parseFractionOf(parseGates, book.id)}
                      onTurn={setChosen}
                      onOpen={onOpen}
                      onRemove={markBook}
                      removeLabel={markPhrase}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
      </div>
    </div>
  )
}
