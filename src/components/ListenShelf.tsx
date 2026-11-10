import type { LibraryBook, TtsConfig } from '../types'
import { shelfMarks } from '../lib/format'
import { parseCaption, parseFractionOf } from '../lib/parseGate'
import { rateLabel } from '../lib/tts/config'

type Props = {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  tts: TtsConfig
  onListen: (id: string) => void
  onVoice: () => void
  /** The sheet supplies its own panel head, so the phone tab's h1 can be hidden. */
  heading?: boolean
}

export function ListenShelf({ books, parseGates, tts, onListen, onVoice, heading = true }: Props) {
  const first = books[0]
  const rest = books.slice(1)
  const provider =
    tts.provider === 'cloud'
      ? `云端 · ${tts.cloudVoice}`
      : tts.provider === 'azure'
        ? `Azure · ${tts.azureVoice}`
        : '系统语音'
  const resumed = typeof first?.lastOpenedAt === 'number' && first.lastOpenedAt > 0
  const firstParsing = first ? parseFractionOf(parseGates, first.id) : null
  return (
    <section className="phone-listen">
      {heading ? <h1>朗读</h1> : null}
      <p className="phone-quiet">让书自己出声。朗读时会换成单栏大字、宽行距的排版，眼睛可以歇一会儿。</p>
      {first ? (
        <button
          className="listen-start"
          type="button"
          disabled={firstParsing !== null}
          onClick={() => onListen(first.id)}
        >
          <span className="listen-start-kicker">
            {firstParsing !== null
              ? parseCaption(firstParsing)
              : resumed ? '从上次停下的地方继续' : '从开头开始朗读'}
          </span>
          <strong>{first.title}</strong>
          <span>{first.author || first.fileName}</span>
          <span className="listen-start-go">开始朗读</span>
        </button>
      ) : (
        <p className="phone-quiet">书架还是空的。导入一本书，就能从这里开始朗读。</p>
      )}
      <div className="phone-listen-settings">
        <div>
          <strong>声音</strong>
          <span>{provider} · {rateLabel(tts.rate)}</span>
        </div>
        <button className="btn" type="button" onClick={onVoice}>
          朗读设置
        </button>
      </div>
      {rest.length ? (
        <>
          <h2>继续朗读</h2>
          <ul>
            {rest.map((book) => {
              const parsing = parseFractionOf(parseGates, book.id)
              return (
                <li key={book.id}>
                  <button type="button" disabled={parsing !== null} onClick={() => onListen(book.id)}>
                    <strong>{book.title}</strong>
                    <span>
                      {parsing !== null
                        ? parseCaption(parsing)
                        : `${book.author || '未知作者'} · ${shelfMarks(book).progress}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </section>
  )
}
