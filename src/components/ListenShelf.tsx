import { useState } from 'react'
import type { LibraryBook, TtsConfig } from '../types'
import { percentLabel, shelfMarks } from '../lib/format'
import { parseCaption, parseFractionOf } from '../lib/parseGate'
import { shelfPlayAction, spokenLine, type ShelfPlayback } from '../lib/shelfListen'
import { rateLabel } from '../lib/tts/config'
import { SleepTimer } from './SleepTimer'

type Props = {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  tts: TtsConfig
  onListen: (id: string) => void
  onVoice: () => void
  playback?: ShelfPlayback | null
  onLocate?: () => void
  /** Kept so the desktop sheet can omit a page title. The player is the page. */
  heading?: boolean
}

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

function providerName(tts: TtsConfig): string {
  if (tts.provider === 'cloud') return '云端'
  if (tts.provider === 'azure') return 'Azure'
  return '系统'
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ListenShelf({ books, parseGates, tts, onListen, onVoice, playback = null, onLocate }: Props) {
  const [index, setIndex] = useState(0)
  const [listOpen, setListOpen] = useState(false)
  const at = books.length === 0 ? 0 : Math.min(index, books.length - 1)
  const now = books[at]
  const parsing = now ? parseFractionOf(parseGates, now.id) : null
  const resumed = typeof now?.lastOpenedAt === 'number' && now.lastOpenedAt > 0
  const marks = now ? shelfMarks(now) : null
  const fraction = parsing ?? now?.fraction ?? 0
  const src = now ? coverSrc(now) : null
  const sessionHere = Boolean(now && shelfPlayAction(now.id, playback) === 'toggle')
  const sounding = sessionHere && (playback?.phase === 'playing' || playback?.phase === 'loading')
  const line = spokenLine(playback)

  return (
    <section className="phone-listen" aria-label="朗读">
      {now && marks ? (
        <div className="listen-stage">
          <div className="listen-cover-slot">
            <div className="listen-spread">
              <div className="listen-spread-page">
                <div className="listen-cover">
                  {src ? <img src={src} alt="" /> : <div className="listen-cover-fallback">{now.title}</div>}
                </div>
              </div>
              <div className="listen-spread-page">
                <p className="listen-words">{line || '开始朗读后，句子出现在这一页'}</p>
              </div>
            </div>
          </div>
          <div className="listen-body">
          <div className="listen-now">
            <h1 className="listen-now-title">{now.title}</h1>
            <p>{now.author || '未知作者'}</p>
          </div>
          <div className="listen-progress">
            <div className="listen-progress-track" aria-hidden="true">
              <i style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }} />
            </div>
            <div className="listen-progress-times">
              <span>{parsing !== null ? parseCaption(parsing) : marks.progress}</span>
              <span>
                {parsing === null && fraction > 0 && fraction < 0.98
                  ? `剩余 ${percentLabel(1 - fraction)}`
                  : ''}
              </span>
            </div>
          </div>
          <div className="listen-play-stack">
          <div className="listen-transport" role="group" aria-label="播放">
            <button
              className="listen-queue-toggle"
              type="button"
              aria-expanded={listOpen}
              aria-label="播放列表"
              onClick={() => setListOpen((open) => !open)}
            >
              <Glyph d="M5 7h14M5 12h14M5 17h10" />
            </button>
            <button
              type="button"
              aria-label="上一本"
              disabled={at === 0}
              onClick={() => setIndex(at - 1)}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path fill="currentColor" d="M16.5 6.2 8.2 12l8.3 5.8z" />
                <path d="M6.5 6v12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
            <SleepTimer inline />
            <button
              className="listen-play"
              type="button"
              disabled={parsing !== null}
              aria-label={sounding ? '暂停朗读' : resumed || sessionHere ? '继续朗读' : '开始朗读'}
              onClick={() => onListen(now.id)}
            >
              {sounding ? (
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                  <path fill="currentColor" d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
                  <path fill="currentColor" d="M8 5.2 18.6 12 8 18.8z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              aria-label="定位原文"
              disabled={!onLocate}
              onClick={onLocate}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M4 5.5h6.2A2.3 2.3 0 0 1 12.5 7.8V19A2.2 2.2 0 0 0 10.2 17.4H4zM20 5.5h-6.2A2.3 2.3 0 0 0 11.5 7.8V19a2.2 2.2 0 0 1 2.3-1.6H20z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              aria-label="下一本"
              disabled={at >= books.length - 1}
              onClick={() => setIndex(at + 1)}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path fill="currentColor" d="M7.5 6.2 15.8 12 7.5 17.8z" />
                <path d="M17.5 6v12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={`朗读设置，${providerName(tts)}，${rateLabel(tts.rate)}`}
              onClick={onVoice}
            >
              <Glyph d="M4 9h3l4-3v12l-4-3H4zM16 9.5a3.5 3.5 0 0 1 0 5M18 7a6.5 6.5 0 0 1 0 10" />
            </button>
          </div>
          </div>
          </div>
          <div className={listOpen ? 'listen-queue open' : 'listen-queue'}>
              <h2>朗读记录</h2>
              <ul>
                {books.map((book, item) => {
                  const gate = parseFractionOf(parseGates, book.id)
                  return (
                    <li key={book.id}>
                      <button
                        type="button"
                        disabled={gate !== null}
                        aria-current={item === at ? 'true' : undefined}
                        onClick={() => {
                          setIndex(item)
                          if (shelfPlayAction(book.id, playback) === 'toggle') return
                          onListen(book.id)
                        }}
                      >
                        <strong>{book.title}</strong>
                        <span>
                          {gate !== null
                            ? parseCaption(gate)
                            : `${playback?.active && playback.bookId === book.id ? '正在听 · ' : ''}${book.author || '未知作者'} · ${shelfMarks(book).progress}`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
          </div>
        </div>
      ) : (
        <p className="phone-quiet">书架还是空的。导入一本书，就能从这里开始朗读。</p>
      )}
    </section>
  )
}
