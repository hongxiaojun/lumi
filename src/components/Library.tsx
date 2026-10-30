import { useEffect, useRef, useState } from 'react'
import type { LibraryBook } from '../types'
import {
  AUDIOBOOK_WAITING,
  addAudiobook,
  audiobookGesture,
  readAudiobookIds,
  removeAudiobook,
  writeAudiobookIds,
} from '../lib/audiobookShelf'

import { featuredBookId, plankRows, plankSize } from '../lib/shelfMotion'
import { parseFractionOf } from '../lib/parseGate'
import {
  SHELF_INDEX,
  booksInSection,
  emptyIndexCopy,
  shelfMark,
  shelfMarkPhrase,
  readShelfSection,
  sectionCounts,
  writeShelfSection,
  type ShelfSection,
} from '../lib/shelfIndex'
import { browserShelfStorage, readShelfView, writeShelfView, type ShelfView } from '../lib/shelfView'
import { CoverShelf } from './CoverShelf'
import { ShelfCaption } from './ShelfCaption'
import { LibraryBanners } from './LibraryBanners'
import { ShelfIndex } from './ShelfIndex'
import { LeafLogo } from './LeafLogo'
import { ShelfBook } from './ShelfBook'
import { UserFontsPanel, type UserFontChoice } from './UserFontsPanel'
import '../shelf.css'

type Props = {
  books: LibraryBook[]
  account?: string | null
  loading?: boolean
  notice?: string | null
  parsePending?: { name: string; fraction: number } | null
  parseGates?: Record<string, number>
  onDismissNotice?: () => void
  onOpen: (id: string) => void
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
  onDismissNotice,
  onOpen,
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
  const [audiobookIds, setAudiobookIds] = useState(() => readAudiobookIds(browserShelfStorage()))
  const [fontsOpen, setFontsOpen] = useState(false)
  const shownBooks = booksInSection(books, section, audiobookIds)
  const counts = sectionCounts(books, audiobookIds)
  const sectionLabel = SHELF_INDEX.find((item) => item.id === section)?.label ?? '我的藏书'
  const continueKicker = section === 'finished' ? '已读完' : section === 'audiobook' ? '有声书' : '继续阅读'
  const markPhrase = shelfMarkPhrase(section)
  const canJoin = audiobookGesture(section) === 'join'
  function rememberAudiobooks(update: (current: string[]) => string[]) {
    setAudiobookIds((current) => {
      const next = update(current)
      writeAudiobookIds(browserShelfStorage(), next)
      return next
    })
  }
  function markBook(id: string) {
    const mark = shelfMark(section)
    if (mark === 'delete') onRemove(id)
    else if (mark === 'leave') rememberAudiobooks((current) => removeAudiobook(current, id))
    else onDrop(id)
  }
  const shelfEmpty = shownBooks.length === 0
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const shown = reduceMotion || entered
  const featured = featuredBookId(shownBooks, chosen)
  const featuredBook = shownBooks.find((book) => book.id === featured) ?? null
  const opened = shownBooks.filter((book) => book.lastOpenedAt)
  const recentId = opened.length > 0 ? featuredBookId(opened, null) : null
  const featuredParsing = featuredBook ? parseFractionOf(parseGates, featuredBook.id) : null
  const turned = shown ? featured : null

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
      <ShelfIndex section={section} counts={counts} onPick={pick} />
      <div className="library-main">
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
          <button className="btn" type="button" disabled={loading} onClick={() => setFontsOpen(true)}>
            我的字体
          </button>
          <button className="btn primary" type="button" onClick={() => inputRef.current?.click()}>
            导入书籍
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".epub,.pdf,.mobi,.azw3,.fb2,.txt"
          multiple
          hidden
          onChange={(event) => {
            takeFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </header>
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

      <LibraryBanners parsePending={parsePending} notice={notice} onDismissNotice={onDismissNotice} />

      <h1 className="shelf-title">{sectionLabel}</h1>
      {section === 'audiobook' && shownBooks.length > 0 ? <p className="shelf-waiting">{AUDIOBOOK_WAITING}</p> : null}

      {view === 'stand' && featuredBook ? (
        <ShelfCaption
          book={featuredBook}
          parsing={featuredParsing}
          continueKicker={continueKicker}
          selected={chosen === featuredBook.id}
          recent={featuredBook.id === recentId}
          joined={audiobookIds.includes(featuredBook.id)}
          onOpen={onOpen}
          onJoin={
            canJoin ? () => rememberAudiobooks((current) => addAudiobook(current, featuredBook.id)) : undefined
          }
        />
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
          <h2>{emptyIndexCopy(section)}</h2>
        </div>
      ) : (
        view === 'cover' ? (
          <CoverShelf
            books={shownBooks}
            parseGates={parseGates}
            continueKicker={continueKicker}
            removeLabel={markPhrase}
            joinedIds={audiobookIds}
            onOpen={onOpen}
            onRemove={markBook}
            onJoin={canJoin ? (id) => rememberAudiobooks((current) => addAudiobook(current, id)) : undefined}
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
