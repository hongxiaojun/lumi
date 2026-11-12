import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpeechPlayer } from './player'
import type { SpeechUnit } from './speech'
import type { SpeakHandle, Speaker } from './types'
import {
  armSleep,
  bindSleepPause,
  isSleepMinutes,
  readSleepClock,
  resetSleepTimer,
  sleepChoiceLabel,
  sleepClock,
  sleepRemaining,
  sleepRemainingLabel,
  SLEEP_MINUTES,
  startSleepAlarm,
  takeSleepDue,
} from './sleepTimer'

const MINUTE = 60_000

afterEach(() => {
  resetSleepTimer()
  vi.useRealTimers()
})

describe('sleep choices', () => {
  it('offers 15, 30, 45, 60, and 90 minutes', () => {
    expect(SLEEP_MINUTES).toEqual([15, 30, 45, 60, 90])
    expect(isSleepMinutes(15)).toBe(true)
    expect(isSleepMinutes(60)).toBe(true)
    expect(isSleepMinutes(0)).toBe(false)
    expect(isSleepMinutes(20)).toBe(false)
    expect(isSleepMinutes(Number.NaN)).toBe(false)
  })

  it('labels an hour as 1 小时 and the others in minutes', () => {
    expect(sleepChoiceLabel(15)).toBe('15 分钟')
    expect(sleepChoiceLabel(30)).toBe('30 分钟')
    expect(sleepChoiceLabel(45)).toBe('45 分钟')
    expect(sleepChoiceLabel(60)).toBe('1 小时')
    expect(sleepChoiceLabel(90)).toBe('90 分钟')
  })
})

describe('armSleep', () => {
  it('sets a wall-clock deadline and replaces a running one', () => {
    expect(armSleep(15, 1_000)).toEqual({ minutes: 15, deadline: 1_000 + 15 * MINUTE })
    expect(armSleep(90, 5_000)).toEqual({ minutes: 90, deadline: 5_000 + 90 * MINUTE })
    expect(readSleepClock().minutes).toBe(90)
  })

  it('clears on 关闭, an unknown duration, or a clock that is not a time', () => {
    armSleep(30, 1_000)
    expect(armSleep(null, 2_000)).toEqual({ minutes: null, deadline: null })
    armSleep(30, 1_000)
    expect(armSleep(0 as never, 2_000).deadline).toBeNull()
    armSleep(30, 1_000)
    expect(armSleep(15, Number.NaN).deadline).toBeNull()
  })
})

describe('sleep remaining', () => {
  it('clamps before the deadline and reaches zero at it', () => {
    const deadline = 10_000
    expect(sleepRemaining(deadline, 9_999)).toBe(1)
    expect(sleepRemaining(deadline, 10_000)).toBe(0)
    expect(sleepRemaining(deadline, 10_001)).toBe(0)
    expect(sleepRemaining(null, 10_000)).toBe(0)
    expect(sleepRemaining(deadline, Number.NaN)).toBe(0)
  })

  it('rounds the clock up so the last second still shows', () => {
    expect(sleepClock(0)).toBe('0:00')
    expect(sleepClock(1)).toBe('0:01')
    expect(sleepClock(59_000)).toBe('0:59')
    expect(sleepClock(60_000)).toBe('1:00')
    expect(sleepClock(61_000)).toBe('1:01')
    expect(sleepClock(90 * MINUTE)).toBe('1:30:00')
    expect(sleepClock(-5)).toBe('0:00')
    expect(sleepRemainingLabel(0)).toBe('0 秒')
    expect(sleepRemainingLabel(1_000)).toBe('1 秒')
    expect(sleepRemainingLabel(61_000)).toBe('1 分 1 秒')
    expect(sleepRemainingLabel(90 * MINUTE)).toBe('1 小时 30 分 0 秒')
  })
})

describe('takeSleepDue', () => {
  it('fires once at the deadline and ignores a later check', () => {
    armSleep(15, 0)
    expect(takeSleepDue(15 * MINUTE - 1)).toBe(false)
    expect(readSleepClock().deadline).toBe(15 * MINUTE)
    expect(takeSleepDue(15 * MINUTE)).toBe(true)
    expect(readSleepClock()).toEqual({ minutes: null, deadline: null })
    expect(takeSleepDue(15 * MINUTE + 5_000)).toBe(false)
  })

  it('does nothing while the timer is off', () => {
    expect(takeSleepDue(0)).toBe(false)
    expect(takeSleepDue(Number.NaN)).toBe(false)
  })
})

describe('startSleepAlarm', () => {
  it('pauses once when the deadline passes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const pause = vi.fn()
    bindSleepPause(pause)
    const stop = startSleepAlarm()
    armSleep(15, Date.now())
    vi.advanceTimersByTime(15 * MINUTE - 1)
    expect(pause).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(readSleepClock().deadline).toBeNull()
    vi.advanceTimersByTime(5_000)
    expect(pause).toHaveBeenCalledTimes(1)
    stop()
  })

  it('pauses when the page is visible again after the deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const pause = vi.fn()
    bindSleepPause(pause)
    const stop = startSleepAlarm()
    armSleep(30, Date.now())
    vi.setSystemTime(Date.now() + 30 * MINUTE)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(pause).toHaveBeenCalledTimes(1)
    expect(readSleepClock().deadline).toBeNull()
    stop()
  })

  it('does not pause when the timer is cleared before the deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const pause = vi.fn()
    bindSleepPause(pause)
    const stop = startSleepAlarm()
    armSleep(45, Date.now())
    armSleep(null)
    vi.advanceTimersByTime(45 * MINUTE)
    expect(pause).not.toHaveBeenCalled()
    stop()
  })
})

describe('SpeechPlayer sleep timer', () => {
  const units: SpeechUnit[] = [
    { blockIndex: 0, text: '第一句。', start: 0, occurrence: 0 },
    { blockIndex: 0, text: '第二句。', start: 4, occurrence: 0 },
  ]

  it('pauses on the next sentence instead of reading past the deadline', () => {
    armSleep(15, 0)
    const calls: { unit: SpeechUnit; onEnd: () => void }[] = []
    const speaker: Speaker = (unit, handlers): SpeakHandle => {
      calls.push({ unit, onEnd: handlers.onEnd })
      return { cancel: () => {}, pause: () => true, resume: () => true }
    }
    const states: string[] = []
    const player = new SpeechPlayer(units, speaker, {
      onState: (state) => states.push(state),
      onUnit: () => {},
    })
    player.start()
    expect(calls.map((call) => call.unit)).toEqual([units[0]])
    calls[0].onEnd()
    expect(calls.map((call) => call.unit)).toEqual([units[0]])
    expect(states.at(-1)).toBe('paused')
    expect(readSleepClock().deadline).toBeNull()
    player.resume()
    expect(calls.map((call) => call.unit)).toEqual([units[0], units[1]])
  })

  it('keeps reading the next sentence when the timer is still running', () => {
    armSleep(15, Date.now())
    const calls: { unit: SpeechUnit; onEnd: () => void }[] = []
    const speaker: Speaker = (unit, handlers): SpeakHandle => {
      calls.push({ unit, onEnd: handlers.onEnd })
      return { cancel: () => {}, pause: () => true, resume: () => true }
    }
    const player = new SpeechPlayer(units, speaker, {
      onState: () => {},
      onUnit: () => {},
    })
    player.start()
    calls[0].onEnd()
    expect(calls.map((call) => call.unit.text)).toEqual(['第一句。', '第二句。'])
    expect(readSleepClock().minutes).toBe(15)
  })
})
