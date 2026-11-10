import { useState } from 'react'
import type { LibraryBook } from '../types'
import { shelfMarks } from '../lib/format'
import { parseFractionOf } from '../lib/parseGate'
import {
  booksInSection,
  emptyIndexCopy,
  shelfMark,
  shelfMarkPhrase,
  type ShelfSection,
} from '../lib/shelfIndex'
import {
  briefBooks,
  continueBooks,
  matchesQuery,
  PHONE_TABS,
  readPhoneTab,
  writePhoneTab,
  type PhoneTab,
} from '../lib/phoneTabs'
import { menuPress } from '../lib/menuChrome'
import { browserShelfStorage } from '../lib/shelfView'
import { CoverShelf } from './CoverShelf'

type Props = {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  onDrop: (id: string) => void
  onImport: () => void
  onFonts: () => void
}

export function PhoneShelf({ books, parseGates, onOpen, onRemove, onDrop, onImport, onFonts }: Props) {
  const [tab, setTab] = useState<PhoneTab>(() => readPhoneTab(browserShelfStorage()))
  const [section, setSection] = useState<ShelfSection>('library')
  const [query, setQuery] = useState('')
  const recent = continueBooks(books, 6)
  const listed = booksInSection(books, section)
  const found = books.filter((book) => matchesQuery(book, query))
  const briefs = briefBooks(books)
  const phrase = shelfMarkPhrase(section)
  function mark(id: string) {
    if (shelfMark(section) === 'delete') onRemove(id)
    else onDrop(id)
  }

  function pick(next: PhoneTab) {
    setTab(next)
    writePhoneTab(browserShelfStorage(), next)
  }

  return (
    <div className="phone-shelf">
      <div className="phone-page">
        {tab === 'home' ? (
          <Home
            books={recent}
            parseGates={parseGates}
            onOpen={onOpen}
            onImport={onImport}
            onFonts={onFonts}
          />
        ) : null}
        {tab === 'books' ? (
          <>
            <SectionSwitch section={section} onPick={(next) => setSection(phoneSectionToShelf(next))} />
            {listed.length === 0 ? <p className="phone-quiet">{emptyIndexCopy(section) ?? '书架还是空的'}</p> : null}
            <CoverShelf
              books={listed}
              parseGates={parseGates}
              removeLabel={phrase}
              onOpen={onOpen}
              onRemove={mark}
            />
          </>
        ) : null}
        {tab === 'search' ? (
          <Search books={found} query={query} parseGates={parseGates} onQuery={setQuery} onOpen={onOpen} />
        ) : null}
        {tab === 'brief' ? <Brief books={briefs} onOpen={onOpen} /> : null}
      </div>
      <nav className="phone-tabs" aria-label="书架页面">
        {PHONE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => pick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function phoneSectionToShelf(section: 'all' | 'reading' | 'finished'): ShelfSection {
  if (section === 'reading') return 'reading'
  if (section === 'finished') return 'finished'
  return 'library'
}

function SectionSwitch({
  section,
  onPick,
}: {
  section: ShelfSection
  onPick: (next: 'all' | 'reading' | 'finished') => void
}) {
  const current = section === 'library' ? 'all' : section
  const items: { id: 'all' | 'reading' | 'finished'; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'reading', label: '正在读' },
    { id: 'finished', label: '已读完' },
  ]
  return (
    <div className="phone-sections" role="group" aria-label="书库分类">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={current === item.id}
          onClick={() => onPick(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function Home({
  books,
  parseGates,
  onOpen,
  onImport,
  onFonts,
}: {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  onOpen: (id: string) => void
  onImport: () => void
  onFonts: () => void
}) {
  return (
    <section className="phone-home">
      <h1>主页</h1>
      <div className="phone-actions">
        <button className="btn primary" type="button" onClick={onImport}>
          导入书籍
        </button>
        <button className="btn" type="button" onPointerUp={(event) => menuPress(event, onFonts)}>
          我的字体
        </button>
      </div>
      <h2>继续阅读</h2>
      {books.length === 0 ? (
        <p className="phone-quiet">还没有打开过的书。导入一本，读过之后会出现在这里。</p>
      ) : (
        <div className="phone-row">
          {books.map((book) => (
            <BookChip key={book.id} book={book} parsing={parseFractionOf(parseGates, book.id)} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  )
}

function Search({
  books,
  query,
  parseGates,
  onQuery,
  onOpen,
}: {
  books: LibraryBook[]
  query: string
  parseGates?: Record<string, number>
  onQuery: (value: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <section className="phone-search">
      <h1>搜索</h1>
      <input
        className="text-input"
        type="search"
        value={query}
        placeholder="书名、作者或文件名"
        aria-label="搜索书架"
        onChange={(event) => onQuery(event.target.value)}
      />
      {query.trim() && books.length === 0 ? <p className="phone-quiet">书架上没有这本书。</p> : null}
      <ul>
        {books.map((book) => {
          const marks = shelfMarks(book)
          const parsing = parseFractionOf(parseGates, book.id)
          return (
            <li key={book.id}>
              <button type="button" disabled={parsing !== null} onClick={() => onOpen(book.id)}>
                <strong>{book.title}</strong>
                <span>{book.author || book.fileName}</span>
                <span>{marks.progress}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Brief({ books, onOpen }: { books: LibraryBook[]; onOpen: (id: string) => void }) {
  return (
    <section className="phone-brief">
      <h1>摘要</h1>
      <p className="phone-quiet">已点亮的书可以按原句引用。还没点亮的书留在书库里，导入时才会生成骨架。</p>
      {books.length === 0 ? <p className="phone-quiet">还没有点亮的书。</p> : null}
      <ul>
        {books.map((book) => (
          <li key={book.id}>
            <button type="button" onClick={() => onOpen(book.id)}>
              <strong>{book.title}</strong>
              <span>{book.author || '未知作者'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BookChip({
  book,
  parsing,
  onOpen,
}: {
  book: LibraryBook
  parsing: number | null
  onOpen: (id: string) => void
}) {
  const marks = shelfMarks(book)
  return (
    <button className="phone-chip" type="button" disabled={parsing !== null} onClick={() => onOpen(book.id)}>
      <strong>{book.title}</strong>
      <span>{book.author}</span>
      <span>{marks.progress}</span>
    </button>
  )
}
