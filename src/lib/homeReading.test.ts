import { describe, expect, it } from 'vitest'
import {
  addReadSeconds,
  commitVisibleSpan,
  durationLabel,
  emptyHomeReading,
  finishedInYear,
  goalRatio,
  medalMetal,
  loadHomeReading,
  rememberFinished,
  saveHomeReading,
  weekCells,
  withFinishedStamps,
  DAY_GOAL_STOPS,
  YEAR_GOAL_STOPS,
  YEAR_SHOW_STOPS,
} from './homeReading'

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set('leaf:home-reading', initial)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

const noon = new Date(2026, 10, 11, 12).getTime()

describe('goalRatio', () => {
  it('fills the gauge from seconds against the minute goal and stops at full', () => {
    expect(goalRatio(0, 30)).toBe(0)
    expect(goalRatio(15 * 60, 30)).toBe(0.5)
    expect(goalRatio(90 * 60, 30)).toBe(1)
    expect(goalRatio(-5, 30)).toBe(0)
    expect(goalRatio(Number.NaN, 30)).toBe(0)
    expect(goalRatio(60, 0)).toBe(0)
  })
})

describe('durationLabel', () => {
  it('says the minute count and does not round a short span up to a minute', () => {
    expect(durationLabel(0)).toBe('0 分钟')
    expect(durationLabel(-1)).toBe('0 分钟')
    expect(durationLabel(45)).toBe('不到 1 分钟')
    expect(durationLabel(60)).toBe('1 分钟')
    expect(durationLabel(18 * 60 + 59)).toBe('18 分钟')
  })
})

describe('addReadSeconds', () => {
  it('adds only a real short span onto the local day', () => {
    const log = emptyHomeReading()
    const next = addReadSeconds(log, noon, 15)
    expect(next.days['2026-11-11']).toBe(15)
    expect(addReadSeconds(next, noon, 0)).toBe(next)
    expect(addReadSeconds(next, noon, -3)).toBe(next)
    expect(addReadSeconds(next, noon, 500).days['2026-11-11']).toBe(35)
  })
})

describe('commitVisibleSpan', () => {
  it('ignores time while the page is hidden and caps one flush', () => {
    const store = memory()
    const from = noon
    expect(commitVisibleSpan(store, from, from + 25_000, false)).toBe(from + 25_000)
    expect(loadHomeReading(store, noon).days['2026-11-11']).toBeUndefined()
    commitVisibleSpan(store, from, from + 25_000, true)
    expect(loadHomeReading(store, noon).days['2026-11-11']).toBe(20)
    commitVisibleSpan(store, from, from + 400, true)
    expect(loadHomeReading(store, noon).days['2026-11-11']).toBe(20)
  })
})

describe('medalMetal', () => {
  it('stays gray until some reading, silver until the goal, then gold', () => {
    expect(medalMetal(0)).toBe('none')
    expect(medalMetal(0.5)).toBe('silver')
    expect(medalMetal(0.8)).toBe('silver')
    expect(medalMetal(0.99)).toBe('silver')
    expect(medalMetal(1)).toBe('gold')
    expect(medalMetal(1, true)).toBe('none')
    expect(medalMetal(Number.NaN)).toBe('none')
  })
})

describe('weekCells', () => {
  it('starts on Monday and leaves later days in the same week empty', () => {
    expect(new Date(2026, 10, 11).getDay()).toBe(3)
    const log = { ...emptyHomeReading(), days: { '2026-11-11': 15 * 60 } }
    const cells = weekCells(log, noon)
    expect(cells.map((cell) => cell.label)).toEqual(['一', '二', '三', '四', '五', '六', '日'])
    expect(cells.map((cell) => cell.key)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
    expect(cells[2]).toMatchObject({ today: true, future: false, seconds: 15 * 60, ratio: 0.5 })
    expect(cells[3]).toMatchObject({ today: false, future: true, seconds: 0, ratio: 0 })
    expect(cells[0].ratio).toBe(0)
  })

  it('keeps Sunday inside the week that began on the previous Monday', () => {
    const sunday = new Date(2026, 10, 15, 9).getTime()
    const cells = weekCells(emptyHomeReading(), sunday)
    expect(cells[6]).toMatchObject({ key: '2026-11-15', today: true, future: false })
    expect(cells[0].key).toBe('2026-11-09')
  })
})

describe('finished years', () => {
  const books = [
    { id: 'this', fraction: 1, lastOpenedAt: noon },
    { id: 'last', fraction: 0.99, lastOpenedAt: new Date(2025, 11, 1).getTime() },
    { id: 'open', fraction: 0.4, lastOpenedAt: noon },
    { id: 'blank', fraction: Number.NaN, lastOpenedAt: null },
  ]

  it('stamps the first finish once and lists only this year', () => {
    const first = withFinishedStamps(emptyHomeReading(), books, noon)
    expect(first.changed).toBe(true)
    expect(first.log.finishedAt.this).toBe(noon)
    expect(first.log.finishedAt.last).toBe(books[1].lastOpenedAt)
    expect(first.log.finishedAt.open).toBeUndefined()
    const again = withFinishedStamps(first.log, books, noon + 10_000)
    expect(again.changed).toBe(false)
    expect(again.log.finishedAt.this).toBe(noon)
    expect(finishedInYear(books, first.log.finishedAt, 2026).map((book) => book.id)).toEqual(['this'])
    expect(finishedInYear(books, first.log.finishedAt, 2025).map((book) => book.id)).toEqual(['last'])
  })

  it('uses now when a finished book has never been opened', () => {
    const stamped = withFinishedStamps(
      emptyHomeReading(),
      [{ id: 'orphan', fraction: 1, lastOpenedAt: null }],
      noon,
    )
    expect(stamped.log.finishedAt.orphan).toBe(noon)
  })
})

describe('loadHomeReading', () => {
  it('drops garbage and snaps the three goals onto their wheels', () => {
    const store = memory('{"dayGoal":7,"yearGoal":0,"yearShow":99,"days":{"nope":1,"2020-01-01":50,"2026-11-10":12},"finishedAt":{"x":"bad"}}')
    const log = loadHomeReading(store, noon)
    expect(log.dayGoal).toBe(5)
    expect(log.yearGoal).toBe(1)
    expect(log.yearShow).toBe(12)
    expect(log.days['2026-11-10']).toBe(12)
    expect(log.days['2020-01-01']).toBeUndefined()
    expect(log.finishedAt).toEqual({})
    expect(loadHomeReading(memory('not json'), noon)).toEqual(emptyHomeReading())
  })

  it('remembers a finish without moving an existing stamp', () => {
    const store = memory()
    rememberFinished(store, 'a', noon)
    rememberFinished(store, 'a', noon + 50_000)
    expect(loadHomeReading(store, noon).finishedAt.a).toBe(noon)
  })

  it('round-trips a saved log', () => {
    const store = memory()
    const log = { ...emptyHomeReading(), dayGoal: 45, yearShow: 3 }
    saveHomeReading(store, log)
    expect(loadHomeReading(store, noon).dayGoal).toBe(45)
    expect(loadHomeReading(store, noon).yearShow).toBe(3)
  })
})

describe('wheel stops', () => {
  it('offers the daily, yearly, and display counts the home can set', () => {
    expect(DAY_GOAL_STOPS[0]).toBe(5)
    expect(DAY_GOAL_STOPS.at(-1)).toBe(180)
    expect(DAY_GOAL_STOPS).toContain(30)
    expect(YEAR_GOAL_STOPS[0]).toBe(1)
    expect(YEAR_GOAL_STOPS.at(-1)).toBe(48)
    expect(YEAR_SHOW_STOPS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })
})
