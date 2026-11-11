import { readingPlace } from './format'

export const HOME_READING_KEY = 'leaf:home-reading'
const MAX_FLUSH_SECONDS = 20
const KEEP_DAYS = 400
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK = ['一', '二', '三', '四', '五', '六', '日'] as const

export type KeyValue = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type HomeReading = {
  dayGoal: number
  yearGoal: number
  yearShow: number
  days: Record<string, number>
  finishedAt: Record<string, number>
}

export type WeekCell = {
  key: string
  label: string
  seconds: number
  ratio: number
  today: boolean
  future: boolean
}

type BookStamp = {
  id: string
  fraction: number | null
  lastOpenedAt: number | null
}

function stops(from: number, to: number, step: number): number[] {
  const list: number[] = []
  for (let value = from; value <= to; value += step) list.push(value)
  return list
}

export const DAY_GOAL_STOPS = stops(5, 180, 5)
export const YEAR_GOAL_STOPS = stops(1, 48, 1)
export const YEAR_SHOW_STOPS = stops(1, 12, 1)

export function emptyHomeReading(): HomeReading {
  return { dayGoal: 30, yearGoal: 12, yearShow: 5, days: {}, finishedAt: {} }
}

export function localDayKey(time: number): string {
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfLocalDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function snap(value: unknown, step: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const snapped = Math.round(value / step) * step
  if (snapped < min) return min
  if (snapped > max) return max
  return snapped
}

export type MedalMetal = 'none' | 'silver' | 'gold'

/** No reading is gray. Any progress short of the goal is silver. The goal is gold. */
export function medalMetal(ratio: number, future = false): MedalMetal {
  if (future || !Number.isFinite(ratio) || ratio <= 0) return 'none'
  if (ratio >= 1) return 'gold'
  return 'silver'
}

export function goalRatio(seconds: number, goalMinutes: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  const goal = goalMinutes * 60
  if (!Number.isFinite(goal) || goal <= 0) return 0
  return Math.min(1, seconds / goal)
}

export function durationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 分钟'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return '不到 1 分钟'
  return `${minutes} 分钟`
}

export function addReadSeconds(log: HomeReading, at: number, seconds: number): HomeReading {
  if (!Number.isFinite(at) || !Number.isFinite(seconds) || seconds <= 0) return log
  const key = localDayKey(at)
  const add = Math.min(MAX_FLUSH_SECONDS, Math.round(seconds))
  if (!key || add <= 0) return log
  return { ...log, days: { ...log.days, [key]: (log.days[key] ?? 0) + add } }
}

function keptDays(value: unknown, now: number): Record<string, number> {
  if (!value || typeof value !== 'object') return {}
  const today = startOfLocalDay(now)
  const days: Record<string, number> = {}
  for (const [key, seconds] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) continue
    const [year, month, day] = key.split('-').map(Number)
    const stamp = new Date(year, month - 1, day).getTime()
    if (Number.isNaN(stamp)) continue
    if (today - stamp > KEEP_DAYS * DAY_MS) continue
    days[key] = Math.round(seconds)
  }
  return days
}

function keptStamps(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {}
  const stamps: Record<string, number> = {}
  for (const [id, at] of Object.entries(value)) {
    if (typeof at === 'number' && Number.isFinite(at)) stamps[id] = at
  }
  return stamps
}

export function loadHomeReading(store: KeyValue, now = Date.now()): HomeReading {
  try {
    const raw = store.getItem(HOME_READING_KEY)
    if (!raw) return emptyHomeReading()
    const parsed = JSON.parse(raw) as Partial<HomeReading>
    return {
      dayGoal: snap(parsed.dayGoal, 5, 5, 180, 30),
      yearGoal: snap(parsed.yearGoal, 1, 1, 48, 12),
      yearShow: snap(parsed.yearShow, 1, 1, 12, 5),
      days: keptDays(parsed.days, now),
      finishedAt: keptStamps(parsed.finishedAt),
    }
  } catch {
    return emptyHomeReading()
  }
}

export function saveHomeReading(store: KeyValue, log: HomeReading): void {
  try {
    store.setItem(HOME_READING_KEY, JSON.stringify(log))
  } catch {
    // The home still renders if this device refuses storage.
  }
}

export function commitVisibleSpan(
  store: KeyValue,
  from: number,
  to: number,
  wasVisible: boolean,
  cap = MAX_FLUSH_SECONDS,
): number {
  if (!Number.isFinite(to)) return to
  if (wasVisible && Number.isFinite(from) && to > from) {
    const seconds = Math.min(cap, Math.round((to - from) / 1000))
    const log = loadHomeReading(store, to)
    const next = addReadSeconds(log, to, seconds)
    if (next !== log) saveHomeReading(store, next)
  }
  return to
}

export function rememberFinished(store: KeyValue, id: string, at: number): void {
  if (!id || !Number.isFinite(at)) return
  const log = loadHomeReading(store, at)
  if (typeof log.finishedAt[id] === 'number') return
  saveHomeReading(store, { ...log, finishedAt: { ...log.finishedAt, [id]: at } })
}

export function weekCells(log: HomeReading, now: number): WeekCell[] {
  const today = startOfLocalDay(now)
  const weekday = new Date(now).getDay()
  const monday = new Date(today)
  monday.setDate(monday.getDate() + (weekday === 0 ? -6 : 1 - weekday))
  return WEEK.map((label, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = localDayKey(date.getTime())
    const future = date.getTime() > today
    const seconds = future ? 0 : (log.days[key] ?? 0)
    return {
      key,
      label,
      seconds,
      ratio: goalRatio(seconds, log.dayGoal),
      today: date.getTime() === today,
      future,
    }
  })
}

export function withFinishedStamps(
  log: HomeReading,
  books: readonly BookStamp[],
  now: number,
): { log: HomeReading; changed: boolean } {
  let finishedAt = log.finishedAt
  let changed = false
  for (const book of books) {
    if (readingPlace(book.fraction) !== 'finished') continue
    if (typeof finishedAt[book.id] === 'number') continue
    const opened = book.lastOpenedAt
    const at = typeof opened === 'number' && Number.isFinite(opened) && opened > 0 ? opened : now
    if (!changed) finishedAt = { ...finishedAt }
    finishedAt[book.id] = at
    changed = true
  }
  return changed ? { log: { ...log, finishedAt }, changed } : { log, changed }
}

export function finishedInYear<T extends { id: string; fraction: number | null }>(
  books: readonly T[],
  finishedAt: Record<string, number>,
  year: number,
): T[] {
  return books
    .filter((book) => {
      if (readingPlace(book.fraction) !== 'finished') return false
      const at = finishedAt[book.id]
      return typeof at === 'number' && Number.isFinite(at) && new Date(at).getFullYear() === year
    })
    .slice()
    .sort((a, b) => (finishedAt[b.id] ?? 0) - (finishedAt[a.id] ?? 0))
}
