import type { LibraryBook } from '../types'
import { shelfMarks } from '../lib/format'
import { parseCaption } from '../lib/parseGate'
import { AudiobookJoin } from './AudiobookJoin'

type Props = {
  book: LibraryBook
  parsing: number | null
  continueKicker: string
  selected: boolean
  recent: boolean
  joined: boolean
  onJoin?: () => void
  onOpen: (id: string) => void
}

export function ShelfCaption({ book, parsing, continueKicker, selected, recent, joined, onJoin, onOpen }: Props) {
  const marks = shelfMarks(book)
  const kicker = parsing !== null ? parseCaption(parsing) : recent ? continueKicker : selected ? '选中的书' : '书架'
  return (
    <>
      <button
        className="shelf-caption"
        type="button"
        disabled={parsing !== null}
        onClick={() => {
          if (parsing === null) onOpen(book.id)
        }}
      >
        <div className="kicker">{kicker}</div>
        <h2>{book.title}</h2>
        {book.author ? <p>{book.author}</p> : null}
        <p className="book-note">
          上次打开 {marks.opened}
          {' · '}
          {marks.progress === '已经读完' ? '已经阅读' : `阅读进度 ${marks.progress}`}
        </p>
      </button>
      {onJoin ? (
        <AudiobookJoin title={book.title} joined={joined} disabled={parsing !== null} onJoin={onJoin} />
      ) : null}
    </>
  )
}
