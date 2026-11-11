import { useEffect, useRef, type KeyboardEvent } from 'react'

type Props = {
  label: string
  values: readonly number[]
  value: number
  format: (value: number) => string
  onChange: (value: number) => void
}

const ROW = 44

/** A vertical snap wheel. iOS UIPickerView is not available in the web view. */
export function WheelPicker({ label, values, value, format, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const fromWheel = useRef(false)
  const index = Math.max(0, values.indexOf(value))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (fromWheel.current) {
      fromWheel.current = false
      return
    }
    el.scrollTop = index * ROW
  }, [index])

  function choose(next: number) {
    const el = ref.current
    const at = values.indexOf(next)
    if (el && at >= 0) el.scrollTop = at * ROW
    if (next !== value) {
      fromWheel.current = true
      onChange(next)
    }
  }

  function onScroll() {
    const el = ref.current
    if (!el) return
    const at = Math.round(el.scrollTop / ROW)
    const next = values[Math.min(values.length - 1, Math.max(0, at))]
    if (next === undefined || next === value) return
    fromWheel.current = true
    onChange(next)
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = values[Math.min(values.length - 1, Math.max(0, index + step))]
    if (next !== undefined) choose(next)
  }

  return (
    <div className="home-wheel">
      <div
        className="wheel-window"
        ref={ref}
        tabIndex={0}
        role="spinbutton"
        aria-label={label}
        aria-valuemin={values[0]}
        aria-valuemax={values[values.length - 1]}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onScroll={onScroll}
        onKeyDown={onKey}
      >
        <div className="wheel-pad" />
        {values.map((item) => (
          <button
            key={item}
            type="button"
            tabIndex={-1}
            className="wheel-item"
            aria-current={item === value ? 'true' : undefined}
            onClick={() => choose(item)}
          >
            {format(item)}
          </button>
        ))}
        <div className="wheel-pad" />
      </div>
      <div className="wheel-band" aria-hidden="true" />
    </div>
  )
}
