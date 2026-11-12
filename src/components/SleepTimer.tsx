import { useEffect, useState } from 'react'
import {
  armSleep,
  readSleepClock,
  sleepChoiceLabel,
  sleepClock,
  sleepRemaining,
  sleepRemainingLabel,
  SLEEP_MINUTES,
  subscribeSleep,
  type SleepClock,
} from '../lib/tts/sleepTimer'

function useSleepClock(): { clock: SleepClock; now: number } {
  const [clock, setClock] = useState(readSleepClock)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => subscribeSleep(() => {
    setClock(readSleepClock())
    setNow(Date.now())
  }), [])
  useEffect(() => {
    if (clock.deadline === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [clock.deadline])
  return { clock, now }
}

/** Sleep timer for the listen bar and the shelf player. One shared deadline. */
export function SleepTimer({ compact = false }: { compact?: boolean }) {
  const { clock, now } = useSleepClock()
  const [open, setOpen] = useState(false)
  const armed = clock.deadline !== null
  const remaining = sleepClock(sleepRemaining(clock.deadline, now))
  const label = armed
    ? (compact ? remaining : `${remaining} 后关闭`)
    : (compact ? '定时' : '定时关闭')

  return (
    <div className={compact ? 'listen-sleep listen-sleep-bar' : 'listen-sleep listen-sleep-shelf'}>
      {open ? (
        <div className="listen-sleep-choices" role="group" aria-label="睡眠定时">
          <button
            type="button"
            aria-pressed={!armed}
            onClick={() => {
              armSleep(null)
              setOpen(false)
            }}
          >
            关闭
          </button>
          {SLEEP_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={clock.minutes === minutes}
              onClick={() => {
                armSleep(minutes)
                setOpen(false)
              }}
            >
              {sleepChoiceLabel(minutes)}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="listen-sleep-toggle"
        aria-expanded={open}
        aria-pressed={armed}
        aria-label={armed ? `定时关闭，还剩 ${sleepRemainingLabel(sleepRemaining(clock.deadline, now))}` : '定时关闭'}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
    </div>
  )
}
