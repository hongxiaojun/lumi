const CHOICES = [15, 30, 45, 60, 90] as const

export type SleepMinutes = (typeof CHOICES)[number]

export const SLEEP_MINUTES: readonly SleepMinutes[] = CHOICES

export type SleepClock = {
  minutes: SleepMinutes | null
  deadline: number | null
}

const OFF: SleepClock = { minutes: null, deadline: null }

let clock: SleepClock = { ...OFF }
let pausePlayback: (() => void) | null = null
const listeners = new Set<() => void>()

export function isSleepMinutes(value: number): value is SleepMinutes {
  return Number.isFinite(value) && (SLEEP_MINUTES as readonly number[]).includes(value)
}

export function sleepChoiceLabel(minutes: SleepMinutes): string {
  if (minutes === 60) return '1 h'
  return `${minutes} min`
}

export function sleepRemaining(deadline: number | null, now: number): number {
  if (deadline === null || !Number.isFinite(deadline) || !Number.isFinite(now)) return 0
  return Math.max(0, deadline - now)
}

/** Compact countdown. The last partial second still shows, so 1ms is 0:01. */
export function sleepClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  return `${minutes}:${ss}`
}

export function sleepRemainingLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${seconds} 秒`
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
  return `${seconds} 秒`
}

export function readSleepClock(): SleepClock {
  return { ...clock }
}

export function subscribeSleep(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export function armSleep(minutes: SleepMinutes | null, now = Date.now()): SleepClock {
  if (minutes === null || !isSleepMinutes(minutes) || !Number.isFinite(now)) clock = { ...OFF }
  else clock = { minutes, deadline: now + minutes * 60_000 }
  notify()
  return readSleepClock()
}

/** True once, when the deadline has arrived. Later checks stay false. */
export function takeSleepDue(now = Date.now()): boolean {
  if (clock.deadline === null || !Number.isFinite(now) || now < clock.deadline) return false
  clock = { ...OFF }
  notify()
  return true
}

export function bindSleepPause(pause: (() => void) | null): void {
  pausePlayback = pause
}

export function runSleepPause(): void {
  pausePlayback?.()
}

export function resetSleepTimer(): void {
  clock = { ...OFF }
  pausePlayback = null
  listeners.clear()
}

/**
 * Wall clock for the sleep timer. Sentence boundaries also call `takeSleepDue`,
 * so a suspended page timer still stops at the next sentence.
 */
export function startSleepAlarm(): () => void {
  let interval = 0
  let alarm = 0
  const clear = () => {
    window.clearInterval(interval)
    window.clearTimeout(alarm)
    interval = 0
    alarm = 0
  }
  const check = () => {
    if (!takeSleepDue(Date.now())) return
    clear()
    runSleepPause()
  }
  const schedule = () => {
    clear()
    const deadline = readSleepClock().deadline
    if (deadline === null) return
    interval = window.setInterval(check, 1000)
    alarm = window.setTimeout(check, Math.max(0, deadline - Date.now()))
  }
  const unsubscribe = subscribeSleep(schedule)
  document.addEventListener('visibilitychange', check)
  schedule()
  return () => {
    clear()
    unsubscribe()
    document.removeEventListener('visibilitychange', check)
  }
}
