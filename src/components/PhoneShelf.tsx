import { useState } from 'react'
import { readSearchHistory, rememberSearch, writeSearchHistory } from '../lib/searchHistory'
import type { LibraryBook, TtsConfig } from '../types'
import { shelfMarks } from '../lib/format'
import { parseCaption, parseFractionOf } from '../lib/parseGate'
import {
  booksInSection,
  emptyIndexCopy,
  shelfMark,
  shelfMarkPhrase,
  type ShelfSection,
} from '../lib/shelfIndex'
import {
  continueBooks,
  matchesQuery,
  PHONE_TABS,
  readPhoneTab,
  writePhoneTab,
  type PhoneTab,
} from '../lib/phoneTabs'
import { browserShelfStorage } from '../lib/shelfView'
import { CoverShelf } from './CoverShelf'
import { ListenShelf } from './ListenShelf'
import { ParseBar } from './ParseBar'
import { PhoneHome } from './PhoneHome'

type Props = {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  parsePending?: { name: string; fraction: number } | null
  notice?: string | null
  onDismissNotice?: () => void
  tts: TtsConfig
  onOpen: (id: string) => void
  onListen: (id: string) => void
  onRemove: (id: string) => void
  onDrop: (id: string) => void
  onImport: () => void
  onFonts: () => void
  onVoice: () => void
}

export function PhoneShelf({
  books,
  parseGates,
  parsePending,
  notice,
  tts,
  onDismissNotice,
  onOpen,
  onListen,
  onRemove,
  onDrop,
  onImport,
  onFonts,
  onVoice,
}: Props) {
  const [tab, setTab] = useState<PhoneTab>(() => readPhoneTab(browserShelfStorage()))
  const [section, setSection] = useState<ShelfSection>('library')
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState(() => readSearchHistory(browserShelfStorage()))
  const listed = booksInSection(books, section)
  const found = books.filter((book) => matchesQuery(book, query))
  const listenRecent = continueBooks(books, 8)
  const listenShelf = listenRecent.length ? listenRecent : books
  const phrase = shelfMarkPhrase(section)
  function mark(id: string) {
    if (shelfMark(section) === 'delete') onRemove(id)
    else onDrop(id)
  }

  function pick(next: PhoneTab) {
    setTab(next)
    writePhoneTab(browserShelfStorage(), next)
  }

  function remember(value: string) {
    const next = rememberSearch(history, value)
    if (next.join('\n') === history.join('\n')) return
    setHistory(next)
    writeSearchHistory(browserShelfStorage(), next)
  }

  return (
    <div className="phone-shelf">
      <div className="phone-page">
        {parsePending ? (
          <div className="parse-banner phone-banner" role="status">
            <p>
              正在解析《{parsePending.name}》
              {' · '}
              {parseCaption(parsePending.fraction)}
            </p>
            <ParseBar fraction={parsePending.fraction} />
          </div>
        ) : null}
        {notice ? (
          <div className="import-notice phone-banner" role="alert">
            <p>{notice}</p>
            <button type="button" onClick={onDismissNotice} aria-label="关闭导入提示">
              关闭
            </button>
          </div>
        ) : null}
        {tab === 'home' ? (
          <PhoneHome
            books={books}
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
          <Search
            books={found}
            query={query}
            history={history}
            parseGates={parseGates}
            onQuery={setQuery}
            onRemember={remember}
            onOpen={onOpen}
          />
        ) : null}
        {tab === 'listen' ? (
          <ListenShelf
            books={listenShelf}
            parseGates={parseGates}
            tts={tts}
            onListen={onListen}
            onVoice={onVoice}
          />
        ) : null}
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

function Search({
  books,
  query,
  history,
  parseGates,
  onQuery,
  onRemember,
  onOpen,
}: {
  books: LibraryBook[]
  query: string
  history: string[]
  parseGates?: Record<string, number>
  onQuery: (value: string) => void
  onRemember: (value: string) => void
  onOpen: (id: string) => void
}) {
  const typed = query.trim().length > 0
  return (
    <section className="phone-search">
      <h1>搜索</h1>
      <input
        className="text-input"
        type="search"
        value={query}
        placeholder="书名、作者或文件名"
        aria-label="搜索书架"
        enterKeyHint="search"
        onChange={(event) => onQuery(event.target.value)}
        onBlur={() => onRemember(query)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onRemember(query)
        }}
      />
      {typed && books.length === 0 ? <p className="phone-quiet">书架上没有这本书。</p> : null}
      {!typed && history.length === 0 ? <p className="phone-quiet">还没有搜索记录。</p> : null}
      {!typed && history.length > 0 ? (
        <>
          <p className="phone-quiet">最近搜索</p>
          <ul>
            {history.map((item) => (
              <li key={item}>
                <button type="button" onClick={() => onQuery(item)}>
                  <strong>{item}</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {typed ? (
        <ul>
          {books.map((book) => {
            const marks = shelfMarks(book)
            const parsing = parseFractionOf(parseGates, book.id)
            return (
              <li key={book.id}>
                <button
                  type="button"
                  disabled={parsing !== null}
                  onClick={() => {
                    onRemember(query)
                    onOpen(book.id)
                  }}
                >
                  <strong>{book.title}</strong>
                  <span>{book.author || book.fileName}</span>
                  <span>{marks.progress}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

