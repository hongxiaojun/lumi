import { percentLabel, sliderSteps } from '../lib/format'

type Props = {
  fraction: number
  chapter?: string
  onSeek: (fraction: number) => void
}

export function ProgressBar({ fraction, chapter, onSeek }: Props) {
  const label = percentLabel(fraction)
  const value = sliderSteps(fraction)
  const rest = `${Math.max(0, 100 - value / 10).toFixed(1)}%`

  return (
    <div className="reader-progress" role="group" aria-label="全书进度">
      <span className="reader-progress-chapter">{chapter || ' '}</span>
      <div className="reader-progress-track">
        <i className="reader-progress-fill" style={{ clipPath: `inset(0 ${rest} 0 0)` }} />
        <input
          className="reader-progress-range"
          type="range"
          min={0}
          max={1000}
          value={value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value / 10)}
          aria-valuetext={label}
          aria-label="全书进度"
          onChange={(e) => onSeek(Number(e.target.value) / 1000)}
        />
      </div>
      <span className="reader-progress-pct">{label}</span>
    </div>
  )
}
