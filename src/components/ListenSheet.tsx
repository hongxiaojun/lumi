import { useState, type ReactNode } from 'react'
import type { ReadAloudView } from './useReadAloud'
import { rateChoices, rateLabel } from '../lib/tts/config'
import { SKIP_SECONDS } from '../lib/tts/transport'
import { SleepTimer } from './SleepTimer'

type Props = {
  view: ReadAloudView
  rate: number
  onCollapse: () => void
  onClose: () => void
  onRate: (rate: number) => void
  onVoice: () => void
}

const USUAL = new Set([1.25, 2])

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      {children}
    </svg>
  )
}

/** In-book player. Collapse and close leave the audio running. The page keeps the sentence. */
export function ListenSheet({ view, rate, onCollapse, onClose, onRate, onVoice }: Props) {
  const playing = view.phase === 'playing' || view.phase === 'loading'
  const [ratesOpen, setRatesOpen] = useState(false)
  const status = view.total > 0
    ? `第 ${Math.min(view.index + 1, view.total)} / ${view.total} 句`
    : '正在朗读'

  return (
    <div className="listen-bar listen-chrome" role="region" aria-label="朗读">
      <div className="listen-sheet-head">
        <button type="button" aria-label="收起播放器" onClick={onCollapse}>收起</button>
        <h2>朗读</h2>
        <button type="button" aria-label="关闭播放器" onClick={onClose}>关闭</button>
      </div>
      <div className="listen-copy">
        <span className="listen-kicker">{status}</span>
        <span className="listen-text">{view.text}</span>
      </div>
      {ratesOpen ? (
        <div className="listen-rates" role="group" aria-label="选择倍速">
          {rateChoices(rate).map((step) => (
            <button
              key={step}
              type="button"
              className={USUAL.has(step) ? 'usual' : ''}
              aria-pressed={Math.abs(step - rate) < 0.001}
              onClick={() => onRate(step)}
            >
              {rateLabel(step)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="listen-transport">
        <button type="button" aria-label="上一分段" onClick={() => view.segment(-1)}>上一分段</button>
        <button type="button" aria-label="后退 5 秒" onClick={() => view.skip(-SKIP_SECONDS)}>−5秒</button>
        <button
          type="button"
          className="listen-play"
          aria-label={playing ? '暂停朗读' : '继续朗读'}
          onClick={view.toggle}
        >
          <Glyph>
            {playing
              ? <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M8 5.5v13M16 5.5v13" />
              : <path fill="currentColor" d="M8 5.2 18.2 12 8 18.8z" />}
          </Glyph>
        </button>
        <button type="button" aria-label="前进 5 秒" onClick={() => view.skip(SKIP_SECONDS)}>+5秒</button>
        <button type="button" aria-label="下一分段" onClick={() => view.segment(1)}>下一分段</button>
      </div>
      <div className="listen-controls">
        <SleepTimer compact />
        <button
          type="button"
          className="listen-rate"
          aria-expanded={ratesOpen}
          aria-label={`语速 ${rateLabel(rate)}，选择倍速`}
          onClick={() => setRatesOpen((open) => !open)}
        >
          {rateLabel(rate)}
        </button>
        <button type="button" className="listen-voice" aria-label="朗读设置" onClick={onVoice}>Aa</button>
      </div>
    </div>
  )
}
