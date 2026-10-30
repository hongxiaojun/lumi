import { parseCaption, parsePercent } from '../lib/parseGate'

export function ParseBar({ fraction }: { fraction: number }) {
  const pct = parsePercent(fraction)
  return (
    <span
      className="parse-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={parseCaption(fraction)}
    >
      <i style={{ width: `${pct}%` }} />
    </span>
  )
}
