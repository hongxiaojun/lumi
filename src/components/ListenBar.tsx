import { useState, type ReactNode } from 'react'
import type { ReadAloudView } from './useReadAloud'
import { rateChoices, rateLabel } from '../lib/tts/config'
import { nextListenChrome, type ListenChrome } from '../lib/tts/listenChrome'
import { SKIP_SECONDS } from '../lib/tts/transport'
import { SleepTimer } from './SleepTimer'

type Props = {
  view: ReadAloudView
  rate: number
  chrome: ListenChrome
  onChrome: (next: ListenChrome) => void
  onRate: (rate: number) => void
  onVoice: () => void
}

const USUAL = new Set([1.25, 2])

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      {children}
    </svg>
  )
}

function PlayIcon({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <Glyph>
        <path {...stroke} d="M8 5.5v13M16 5.5v13" />
      </Glyph>
    )
  }
  return (
    <Glyph>
      <path {...stroke} fill="currentColor" d="M8 5.2 18.2 12 8 18.8z" />
    </Glyph>
  )
}

function CloseIcon() {
  return (
    <Glyph>
      <path {...stroke} d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </Glyph>
  )
}

function Chevron({ direction }: { direction: 'up' | 'down' }) {
  const d = direction === 'down' ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'
  return (
    <Glyph>
      <path {...stroke} d={d} />
    </Glyph>
  )
}

function statusText(view: ReadAloudView): string {
  if (view.phase === 'error') return view.error ?? '朗读没有出声'
  if (view.phase === 'done') return view.error ?? '这一章读完了'
  if (view.phase === 'paused') return '已暂停'
  if (view.phase === 'loading') return '正在准备…'
  if (view.total > 0) return `第 ${Math.min(view.index + 1, view.total)} / ${view.total} 句`
  return '正在朗读'
}

export function ListenBar({ view, rate, chrome, onChrome, onRate, onVoice }: Props) {
  const playing = view.phase === 'playing' || view.phase === 'loading'
  const [ratesOpen, setRatesOpen] = useState(false)
  const choices = rateChoices(rate)
  const status = statusText(view)

  function act(action: 'collapse' | 'close' | 'expand') {
    setRatesOpen(false)
    onChrome(nextListenChrome(chrome, action))
  }

  if (chrome === 'hidden') {
    return (
      <div className="listen-bar listen-chrome listen-hidden" role="region" aria-label="朗读">
        <button type="button" aria-expanded={false} aria-label="展开播放控件" onClick={() => act('expand')}>
          <span>{status}</span>
          <Chevron direction="up" />
        </button>
      </div>
    )
  }

  if (chrome === 'mini') {
    return (
      <div className="listen-bar listen-chrome listen-mini" role="region" aria-label="朗读">
        <button type="button" className="listen-copy" aria-label="展开播放控件" onClick={() => act('expand')}>
          <span className="listen-kicker">{status}</span>
          <span className="listen-text">{view.text}</span>
        </button>
        <button
          type="button"
          className="listen-play"
          aria-label={playing ? '暂停朗读' : '继续朗读'}
          onClick={view.toggle}
        >
          <PlayIcon playing={playing} />
        </button>
        <button type="button" aria-label="展开播放控件" onClick={() => act('expand')}>
          <Chevron direction="up" />
        </button>
        <button type="button" className="listen-close" aria-label="关闭播放控件" onClick={() => act('close')}>
          <CloseIcon />
        </button>
      </div>
    )
  }

  return (
    <div className="listen-bar listen-chrome" role="region" aria-label="朗读">
      <div className="listen-copy">
        <span className="listen-kicker">{status}</span>
        <span className="listen-text">{view.text}</span>
      </div>
      {ratesOpen ? (
        <div className="listen-rates" role="group" aria-label="选择倍速">
          {choices.map((step) => (
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
          <PlayIcon playing={playing} />
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
          onClick={() => setRatesOpen((openRates) => !openRates)}
        >
          {rateLabel(rate)}
        </button>
        <button type="button" className="listen-voice" aria-label="朗读设置" onClick={onVoice}>
          Aa
        </button>
        <button type="button" className="listen-fold" aria-label="收起播放控件" onClick={() => act('collapse')}>
          <Chevron direction="down" />
        </button>
        <button type="button" className="listen-close" aria-label="关闭播放控件" onClick={() => act('close')}>
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
