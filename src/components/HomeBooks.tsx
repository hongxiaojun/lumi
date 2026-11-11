import { useRef, useState } from 'react'
import type { LibraryBook } from '../types'
import { clampFraction, shelfMarks } from '../lib/format'
import { parseCaption, parseFractionOf } from '../lib/parseGate'

const covers = new WeakMap<Blob, string>()

function coverSrc(book: LibraryBook): string | null {
  if (book.coverUrl) return book.coverUrl
  if (!book.cover || book.cover.size === 0) return null
  const known = covers.get(book.cover)
  if (known) return known
  const url = URL.createObjectURL(book.cover)
  covers.set(book.cover, url)
  return url
}

function DefaultCover({ book }: { book: LibraryBook }) {
  return (
    <span className="home-cover-frame home-cover-default">
      <strong>{book.title || '未命名'}</strong>
      {book.author ? <em>{book.author}</em> : null}
    </span>
  )
}

function BookCover({ book }: { book: LibraryBook }) {
  const src = coverSrc(book)
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <DefaultCover book={book} />
  return (
    <span className="home-cover-frame">
      <img src={src} alt="" onError={() => setFailed(true)} />
    </span>
  )
}

export function ContinueRail({
  books,
  parseGates,
  onOpen,
}: {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  onOpen: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  function onScroll() {
    const el = ref.current
    if (!el || el.clientWidth <= 0) return
    setPage(Math.round(el.scrollLeft / el.clientWidth))
  }

  function go(index: number) {
    const el = ref.current
    if (!el) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    el.scrollTo({ left: index * el.clientWidth, behavior: motion })
  }

  return (
    <>
      <div className="home-rail" ref={ref} onScroll={onScroll}>
        {books.map((book) => {
          const parsing = parseFractionOf(parseGates, book.id)
          const marks = shelfMarks(book)
          return (
            <button
              key={book.id}
              className="home-card"
              type="button"
              disabled={parsing !== null}
              aria-label={`${book.title}，${parsing !== null ? parseCaption(parsing) : marks.progress}`}
              onClick={() => onOpen(book.id)}
            >
              <BookCover book={book} />
              <span className="home-card-copy">
                <strong>{book.title}</strong>
                <span className="home-author">{book.author || '未知作者'}</span>
                <span className="home-progress" aria-hidden="true">
                  <i style={{ width: `${Math.round(clampFraction(parsing ?? book.fraction) * 100)}%` }} />
                </span>
                <span>{parsing !== null ? parseCaption(parsing) : marks.progress}</span>
              </span>
            </button>
          )
        })}
      </div>
      {books.length > 1 ? (
        <div className="home-dots">
          {books.map((book, index) => (
            <button
              key={book.id}
              type="button"
              aria-label={`第 ${index + 1} 本`}
              aria-current={index === page ? 'true' : undefined}
              onClick={() => go(index)}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

export function YearBook({
  book,
  parsing,
  onOpen,
}: {
  book: LibraryBook
  parsing: number | null
  onOpen: (id: string) => void
}) {
  return (
    <button type="button" disabled={parsing !== null} aria-label={book.title} onClick={() => onOpen(book.id)}>
      <BookCover book={book} />
    </button>
  )
}
