import { useRef, useState } from 'react'
import type { LibraryBook } from '../types'
import { shelfMarks } from '../lib/format'
import { parseCaption, parseFractionOf } from '../lib/parseGate'
import { ParseBar } from './ParseBar'
import '../cover.css'

const blobCovers = new WeakMap<Blob, string>()

function coverSrc(book: LibraryBook): string | null {
  if (book.coverUrl) return book.coverUrl
  if (!book.cover || book.cover.size === 0) return null
  const known = blobCovers.get(book.cover)
  if (known) return known
  const url = URL.createObjectURL(book.cover)
  blobCovers.set(book.cover, url)
  return url
}

type Props = {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  continueKicker?: string
  removeLabel?: string
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

function latestOpened(books: readonly LibraryBook[]): LibraryBook | null {
  let best: LibraryBook | null = null
  for (const book of books) {
    if (!book.lastOpenedAt) continue
    if (!best || book.lastOpenedAt > (best.lastOpenedAt ?? 0)) best = book
  }
  return best
}

function BookNotes({ book }: { book: LibraryBook }) {
  const marks = shelfMarks(book)
  return (
    <>
      <p className="book-note">上次打开 {marks.opened}</p>
      <p className="book-note">{marks.progress === '已经读完' ? '已经阅读' : `阅读进度 ${marks.progress}`}</p>
    </>
  )
}

function Cover({ book, compact, parsing }: { book: LibraryBook; compact?: boolean; parsing: number | null }) {
  const badge = shelfMarks(book).badge
  const src = coverSrc(book)
  return (
    <div className={`cover-wrap${compact ? ' mini' : ''}`}>
      {src ? <img src={src} alt="" /> : <div className="cover-fallback">{book.title}</div>}
      {book.aiBuiltAt ? <span className="ai-badge">AI</span> : null}
      {badge ? <span className={`cover-flag${badge === '已读完' ? ' done' : ''}`}>{badge}</span> : null}
      {parsing !== null ? (
        <div className="parse-cover">
          <span>{parseCaption(parsing)}</span>
          <ParseBar fraction={parsing} />
        </div>
      ) : book.fraction > 0 ? (
        <div className="progress-bar">
          <i style={{ width: `${Math.round(book.fraction * 100)}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function CoverShelf({
  books,
  parseGates,
  continueKicker = '继续阅读',
  removeLabel = '从书架移除',
  onOpen,
  onRemove,
}: Props) {
  const [held, setHeld] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  function hold(id: string) {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHeld(id), 450)
  }
  function release() {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  const recent = latestOpened(books)
  const recentMarks = recent ? shelfMarks(recent) : null
  const recentParsing = recent ? parseFractionOf(parseGates, recent.id) : null

  return (
    <div className="cover-shelf">
      {recent ? (
        <button
          className="continue"
          type="button"
          disabled={recentParsing !== null}
          onClick={() => {
            if (recentParsing === null) onOpen(recent.id)
          }}
        >
          <Cover book={recent} compact parsing={recentParsing} />
          <div>
            <div className="kicker">{recentParsing !== null ? parseCaption(recentParsing) : continueKicker}</div>
            <h2>{recent.title}</h2>
            {recent.author ? <p>{recent.author}</p> : null}
            {recentMarks ? (
              <p className="book-note">
                上次打开 {recentMarks.opened}
                {' · '}
                {recentMarks.progress === '已经读完' ? '已经阅读' : `阅读进度 ${recentMarks.progress}`}
              </p>
            ) : null}
          </div>
        </button>
      ) : null}
      <div className="grid">
        {books.map((book) => {
          const parsing = parseFractionOf(parseGates, book.id)
          return (
          <article className={held === book.id ? 'book held' : 'book'} key={book.id}>
            <button
              className="book-open"
              type="button"
              disabled={parsing !== null}
              aria-label={parsing !== null ? `${book.title}，${parseCaption(parsing)}，完成后才能打开` : undefined}
              onPointerDown={() => {
                if (parsing === null) hold(book.id)
              }}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              onClick={() => {
                if (parsing === null && held !== book.id) onOpen(book.id)
              }}
            >
              <Cover book={book} parsing={parsing} />
              <h3 className="book-title">{book.title}</h3>
              {book.author ? <p className="book-author">{book.author}</p> : null}
              <BookNotes book={book} />
            </button>
            <button
              className="book-remove"
              type="button"
              tabIndex={held === book.id ? 0 : -1}
              title={removeLabel}
              aria-label={`${removeLabel} ${book.title}`}
              disabled={parsing !== null}
              onClick={() => {
                if (parsing === null) onRemove(book.id)
              }}
            >
              ×
            </button>
          </article>
          )
        })}
      </div>
    </div>
  )
}
