import { useEffect, useState, type CSSProperties } from 'react'
import type { LibraryBook } from '../types'
import { shelfMarks } from '../lib/format'
import { parseCaption, parsePercent } from '../lib/parseGate'
import { clothFor, spineLabel } from '../lib/shelfMotion'
import { ParseBar } from './ParseBar'

type Props = {
  book: LibraryBook
  open: boolean
  parsing?: number | null
  onTurn: (id: string) => void
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  removeLabel?: string
}

function LeafMark() {
  return (
    <svg className="spine-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14.2C8 9.2 10.2 6.2 14 5.2 12.2 9 11.6 11.4 12.2 14.2H8Z" fill="currentColor" />
      <path d="M8 14.2C8 8.6 5.6 5.2 2 3.6 4.2 7.2 5.4 10.2 6.4 14.2H8Z" fill="currentColor" />
    </svg>
  )
}

export function ShelfBook({ book, open, parsing = null, onTurn, onOpen, onRemove, removeLabel = '从书架移除' }: Props) {
  const cloth = clothFor(book.id)
  const marks = shelfMarks(book)
  const label = spineLabel(book.title)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  useEffect(() => {
    if (book.coverUrl || !book.cover || book.cover.size === 0) return
    const url = URL.createObjectURL(book.cover)
    setObjectUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setObjectUrl(null)
    }
  }, [book.cover, book.coverUrl])
  const src = book.coverUrl || objectUrl

  const progress = parsing !== null ? parseCaption(parsing) : marks.progress === '已经读完' ? '已经阅读' : `阅读进度 ${marks.progress}`
  const action = parsing !== null ? '完成后才能打开' : open ? '再按一次打开' : '按一下转出封面'

  return (
    <div
      className={`tome-slot${open ? ' open' : ''}`}
      data-book={book.id}
      style={{ '--cloth': cloth.cloth, '--ink': cloth.ink } as CSSProperties}
    >
      <button
        type="button"
        className="tome-hit"
        aria-expanded={open}
        aria-label={`${book.title}，${book.author || '未知作者'}，${progress}，${action}`}
        disabled={parsing !== null}
        onClick={() => {
          if (parsing !== null) return
          if (open) onOpen(book.id)
          else onTurn(book.id)
        }}
      >
        <span className="scene">
          <span className="tome">
            <span className="face front">
              {src ? <img src={src} alt="" /> : <span className="front-title">{book.title}</span>}
              {book.aiBuiltAt ? <span className="ai-badge">AI</span> : null}
              {marks.badge ? (
                <span className={`cover-flag${marks.badge === '已读完' ? ' done' : ''}`}>{marks.badge}</span>
              ) : null}
              {parsing !== null ? (
                <span className="parse-cover">
                  <span>{parseCaption(parsing)}</span>
                  <ParseBar fraction={parsing} />
                </span>
              ) : book.fraction > 0 ? (
                <span className="progress-bar">
                  <i style={{ width: `${Math.round(book.fraction * 100)}%` }} />
                </span>
              ) : null}
            </span>
            <span className="face rear" />
            <span className="face spine">
              <b>{label}</b>
              <LeafMark />
              {parsing !== null ? (
                <span className="spine-progress">
                  <i style={{ width: `${parsePercent(parsing)}%` }} />
                </span>
              ) : book.fraction > 0 ? (
                <span className="spine-progress">
                  <i style={{ width: `${Math.round(book.fraction * 100)}%` }} />
                </span>
              ) : null}
            </span>
            <span className="face pages" />
          </span>
        </span>
      </button>
      <span className="tome-shadow" aria-hidden="true" />
      <button
        type="button"
        className="book-remove"
        title={removeLabel}
        aria-label={`${removeLabel} ${book.title}`}
        disabled={parsing !== null}
        onClick={() => {
          if (parsing === null) onRemove(book.id)
        }}
      >
        ×
      </button>
    </div>
  )
}
