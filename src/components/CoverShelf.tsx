import type { LibraryBook } from '../types'
import { shelfMarks } from '../lib/format'
import '../cover.css'

const blobCovers = new WeakMap<Blob, string>()

function coverSrc(book: LibraryBook): string | null {
  if (book.coverUrl) return book.coverUrl
  if (!book.cover) return null
  const known = blobCovers.get(book.cover)
  if (known) return known
  const url = URL.createObjectURL(book.cover)
  blobCovers.set(book.cover, url)
  return url
}

type Props = {
  books: LibraryBook[]
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

function Cover({ book, compact }: { book: LibraryBook; compact?: boolean }) {
  const badge = shelfMarks(book).badge
  const src = coverSrc(book)
  return (
    <div className={`cover-wrap${compact ? ' mini' : ''}`}>
      {src ? <img src={src} alt="" /> : <div className="cover-fallback">{book.title}</div>}
      {book.aiBuiltAt ? <span className="ai-badge">AI</span> : null}
      {badge ? <span className={`cover-flag${badge === '已读完' ? ' done' : ''}`}>{badge}</span> : null}
      {book.fraction > 0 ? (
        <div className="progress-bar">
          <i style={{ width: `${Math.round(book.fraction * 100)}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function CoverShelf({ books, onOpen, onRemove }: Props) {
  const recent = latestOpened(books)
  const recentMarks = recent ? shelfMarks(recent) : null

  return (
    <div className="cover-shelf">
      {recent ? (
        <button className="continue" type="button" onClick={() => onOpen(recent.id)}>
          <Cover book={recent} compact />
          <div>
            <div className="kicker">继续阅读</div>
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
      <p className="shelf-label">全部书籍</p>
      <div className="grid">
        {books.map((book) => (
          <article className="book" key={book.id}>
            <button className="book-open" type="button" onClick={() => onOpen(book.id)}>
              <Cover book={book} />
              <h3 className="book-title">{book.title}</h3>
              {book.author ? <p className="book-author">{book.author}</p> : null}
              <BookNotes book={book} />
            </button>
            <button
              className="book-remove"
              type="button"
              title="从书架移除"
              aria-label={`从书架移除 ${book.title}`}
              onClick={() => onRemove(book.id)}
            >
              ×
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
