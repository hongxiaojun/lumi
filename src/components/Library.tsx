import { useEffect, useRef, useState } from 'react'
import type { LibraryBook } from '../types'
import { shelfMarks } from '../lib/format'
import { featuredBookId, plankRows, plankSize } from '../lib/shelfMotion'
import { browserShelfStorage, readShelfView, writeShelfView, type ShelfView } from '../lib/shelfView'
import { CoverShelf } from './CoverShelf'
import { LeafLogo } from './LeafLogo'
import { ShelfBook } from './ShelfBook'
import '../shelf.css'

type Props = {
  books: LibraryBook[]
  account?: string | null
  loading?: boolean
  notice?: string | null
  onDismissNotice?: () => void
  onOpen: (id: string) => void
  onImport: (files: FileList | File[]) => void
  onRemove: (id: string) => void
}

export function Library({ books, account, loading, notice, onDismissNotice, onOpen, onImport, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const shelfRef = useRef<HTMLDivElement>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [rowSize, setRowSize] = useState(10)
  const [entered, setEntered] = useState(false)
  const [view, setView] = useState<ShelfView>(() => readShelfView(browserShelfStorage()))
  const shelfEmpty = books.length === 0
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const shown = reduceMotion || entered
  const featured = featuredBookId(books, chosen)
  const featuredBook = books.find((book) => book.id === featured) ?? null
  const opened = books.filter((book) => book.lastOpenedAt)
  const recentId = opened.length > 0 ? featuredBookId(opened, null) : null
  const marks = featuredBook ? shelfMarks(featuredBook) : null
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

  return (
    <div
      className="library"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        takeFiles(event.dataTransfer.files)
      }}
    >
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

      {notice && (
        <div className="import-notice" role="alert">
          <p>{notice}</p>
          <button type="button" onClick={onDismissNotice} aria-label="关闭导入提示">
            关闭
          </button>
        </div>
      )}

      {view === 'stand' && featuredBook && marks ? (
        <button className="shelf-caption" type="button" onClick={() => onOpen(featuredBook.id)}>
          <div className="kicker">
            {featuredBook.id === recentId ? '继续阅读' : chosen === featuredBook.id ? '选中的书' : '书架'}
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
      ) : (
        view === 'cover' ? (
          <CoverShelf books={books} onOpen={onOpen} onRemove={onRemove} />
        ) : (
          <div className="shelves" ref={shelfRef}>
            {plankRows(books, rowSize).map((row) => (
              <div className="plank" key={row[0].id}>
                <div className="plank-row">
                  {row.map((book) => (
                    <ShelfBook
                      key={book.id}
                      book={book}
                      open={turned === book.id}
                      onTurn={setChosen}
                      onOpen={onOpen}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
