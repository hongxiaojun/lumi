import type { ReactNode } from 'react'
import type { ReadAloudView } from './useReadAloud'
import { nextRate, rateLabel } from '../lib/tts/config'

type Props = {
  view: ReadAloudView
  rate: number
  onRate: (rate: number) => void
  onVoice: () => void
  onStop: () => void
}

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

function SkipIcon({ back }: { back?: boolean }) {
  return (
    <Glyph>
      <path {...stroke} d={back ? 'M17.5 6.5 9 12l8.5 5.5z' : 'M6.5 6.5 15 12l-8.5 5.5z'} />
      <path {...stroke} d={back ? 'M5.5 6.5v11' : 'M18.5 6.5v11'} />
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

function statusText(view: ReadAloudView): string {
  if (view.phase === 'error') return view.error ?? '朗读没有出声'
  if (view.phase === 'done') return view.error ?? '这一章读完了'
  if (view.phase === 'paused') return '已暂停'
  if (view.phase === 'loading') return '正在准备…'
  if (view.total > 0) return `第 ${Math.min(view.index + 1, view.total)} / ${view.total} 句`
  return '正在朗读'
}

export function ListenBar({ view, rate, onRate, onVoice, onStop }: Props) {
  const playing = view.phase === 'playing' || view.phase === 'loading'
  return (
    <div className="listen-bar" role="region" aria-label="朗读">
      <div className="listen-copy">
        <span className="listen-kicker">{statusText(view)}</span>
        <span className="listen-text">{view.text}</span>
      </div>
      <div className="listen-controls">
        <button type="button" className="listen-step" aria-label="上一句" onClick={view.previous}>
          <SkipIcon back />
        </button>
        <button
          type="button"
          className="listen-play"
          aria-label={playing ? '暂停朗读' : '继续朗读'}
          onClick={view.toggle}
        >
          <PlayIcon playing={playing} />
        </button>
        <button type="button" className="listen-step" aria-label="下一句" onClick={view.next}>
          <SkipIcon />
        </button>
        <button
          type="button"
          className="listen-rate"
          aria-label={`语速 ${rateLabel(rate)}，点按切换`}
          onClick={() => onRate(nextRate(rate))}
        >
          {rateLabel(rate)}
        </button>
        <button type="button" className="listen-voice" aria-label="朗读设置" onClick={onVoice}>
          Aa
        </button>
        <button type="button" className="listen-close" aria-label="退出朗读" onClick={onStop}>
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
