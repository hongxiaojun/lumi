import type { PointerEvent, ReactNode } from 'react'
import { pointerHoldsMenu } from '../lib/menuChrome'

type Props = {
  title: string
  shown: boolean
  marked: boolean
  tocOn: boolean
  marksOn: boolean
  notesOn: boolean
  sizeOn: boolean
  searchOn: boolean
  onPointer: (over: boolean) => void
  onBack: () => void
  onToc: () => void
  onMarks: () => void
  onNotes: () => void
  onSize: () => void
  onSearch: () => void
  onMarkHere: () => void
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      {children}
    </svg>
  )
}

function TocIcon() {
  return (
    <Glyph>
      <path {...stroke} d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5" />
      <circle cx="5.2" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="5.2" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5.2" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </Glyph>
  )
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <Glyph>
      <path
        {...stroke}
        fill={filled ? 'currentColor' : 'none'}
        d="M7 4.2h10a1 1 0 0 1 1 1V20l-6-3.1L6 20V5.2a1 1 0 0 1 1-1z"
      />
    </Glyph>
  )
}

function NotesIcon() {
  return (
    <Glyph>
      <path {...stroke} d="M7 3.8h6.2L18 8.6V19.2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1z" />
      <path {...stroke} d="M13 3.8V8.6h5" />
      <path {...stroke} d="M9 12.2h6M9 15.8h6" />
    </Glyph>
  )
}

function SearchIcon() {
  return (
    <Glyph>
      <circle {...stroke} cx="10.5" cy="10.5" r="5.2" />
      <path {...stroke} d="M14.6 14.6 19.2 19.2" />
    </Glyph>
  )
}

function BackIcon() {
  return (
    <Glyph>
      <path {...stroke} d="M14.2 6.2 8 12.2l6.2 6" />
    </Glyph>
  )
}

export function BookMenu({
  title, shown, marked, tocOn, marksOn, notesOn, sizeOn, searchOn,
  onPointer, onBack, onToc, onMarks, onNotes, onSize, onSearch, onMarkHere,
}: Props) {
  function hover(over: boolean) {
    return (event: PointerEvent) => {
      if (!pointerHoldsMenu(event.pointerType)) return
      onPointer(over)
    }
  }

  return (
    <div
      className={shown ? 'book-menu-zone shown' : 'book-menu-zone'}
      onPointerEnter={hover(true)}
      onPointerLeave={hover(false)}
    >
      <div className="book-menu" role="toolbar" aria-label="阅读菜单">
        <div className="book-menu-left">
          <button type="button" className="book-menu-back" aria-label="返回" onClick={onBack}>
            <BackIcon />
          </button>
          <div className="book-menu-pill">
            <button type="button" aria-label="目录" aria-pressed={tocOn} onClick={onToc}>
              <TocIcon />
            </button>
            <button type="button" aria-label="书签" aria-pressed={marksOn} onClick={onMarks}>
              <BookmarkIcon />
            </button>
            <button type="button" aria-label="笔记" aria-pressed={notesOn} onClick={onNotes}>
              <NotesIcon />
            </button>
          </div>
        </div>
        <div className="book-menu-title">{title}</div>
        <div className="book-menu-right">
          <div className="book-menu-pill">
            <button type="button" className="book-menu-size" aria-pressed={sizeOn} onClick={onSize}>
              大小
            </button>
            <button type="button" aria-label="搜索" aria-pressed={searchOn} onClick={onSearch}>
              <SearchIcon />
            </button>
          </div>
          <button
            type="button"
            className="book-menu-mark"
            aria-label="此处书签"
            aria-pressed={marked}
            onClick={onMarkHere}
          >
            <BookmarkIcon filled={marked} />
          </button>
        </div>
      </div>
    </div>
  )
}
