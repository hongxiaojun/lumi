import { useEffect, useState } from 'react'
import type { LibraryBook } from '../types'
import {
  DAY_GOAL_STOPS,
  YEAR_GOAL_STOPS,
  YEAR_SHOW_STOPS,
  durationLabel,
  finishedInYear,
  medalMetal,
  loadHomeReading,
  saveHomeReading,
  weekCells,
  withFinishedStamps,
  type HomeReading,
} from '../lib/homeReading'
import { continueBooks } from '../lib/phoneTabs'
import { parseFractionOf } from '../lib/parseGate'
import { menuPress } from '../lib/menuChrome'
import { ContinueRail, YearBook } from './HomeBooks'
import { HomeGoalSheet } from './HomeGoalSheet'
import { MedalDefs, WeekMedal } from './WeekMedal'
import { WheelPicker } from './WheelPicker'

type Props = {
  books: LibraryBook[]
  parseGates?: Record<string, number>
  onOpen: (id: string) => void
  onImport: () => void
  onFonts: () => void
}

export function PhoneHome({ books, parseGates, onOpen, onImport, onFonts }: Props) {
  const [reading, setReading] = useState<HomeReading>(() => loadHomeReading(localStorage))
  const [goal, setGoal] = useState<'day' | 'year' | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  const shelfKey = books.map((book) => `${book.id}:${book.fraction}:${book.lastOpenedAt ?? ''}`).join('|')
  const [seen, setSeen] = useState('')
  if (shelfKey !== seen) {
    setSeen(shelfKey)
    const stamped = withFinishedStamps(reading, books, now)
    if (stamped.changed) {
      saveHomeReading(localStorage, stamped.log)
      setReading(stamped.log)
    }
  }
  const recent = continueBooks(books, 5)
  const year = new Date(now).getFullYear()
  const finishedAll = finishedInYear(books, reading.finishedAt, year)
  const finished = finishedAll.slice(0, reading.yearShow)
  const cells = weekCells(reading, now)
  const today = cells.find((cell) => cell.today)
  const weekSeconds = cells.reduce((sum, cell) => sum + cell.seconds, 0)

  function save(next: HomeReading) {
    saveHomeReading(localStorage, next)
    setReading(next)
  }

  return (
    <section className="phone-home">
      <h1>主页</h1>
      <div className="phone-actions">
        <button className="btn primary" type="button" onClick={onImport}>
          导入书籍
        </button>
        <button className="btn" type="button" onPointerUp={(event) => menuPress(event, onFonts)}>
          我的字体
        </button>
      </div>

      <section className="home-module" aria-label="继续阅读">
        <h2>继续阅读</h2>
        {recent.length === 0 ? (
          <p className="phone-quiet">还没有打开过的书。导入一本，读过之后会出现在这里。</p>
        ) : (
          <ContinueRail books={recent} parseGates={parseGates} onOpen={onOpen} />
        )}
      </section>

      <section className="home-module" aria-label="今日阅读">
        <h2>今日阅读</h2>
        <div className="home-today">
          <Gauge
            ratio={today?.ratio ?? 0}
            label={`今日已读 ${durationLabel(today?.seconds ?? 0)}，目标 ${reading.dayGoal} 分钟`}
          />
          <div className="home-stats">
            <p>今日已读</p>
            <strong>{durationLabel(today?.seconds ?? 0)}</strong>
            <p>目标 {reading.dayGoal} 分钟</p>
          </div>
        </div>
        <div className="home-today-foot">
          <div className="home-week-total" aria-label={`本周已读 ${durationLabel(weekSeconds)}`}>
            <p>本周</p>
            <strong>{durationLabel(weekSeconds)}</strong>
          </div>
          <button
            className="home-goal-open"
            type="button"
            onPointerUp={(event) => menuPress(event, () => setGoal('day'))}
          >
            设置目标
          </button>
        </div>
        <MedalDefs />
        <ol className="home-week">
          {cells.map((cell) => (
            <li
              key={cell.key}
              data-metal={medalMetal(cell.ratio, cell.future)}
              data-today={cell.today ? 'true' : undefined}
              data-future={cell.future ? 'true' : undefined}
              aria-label={weekLabel(cell.label, cell.seconds, cell.future)}
            >
              <WeekMedal label={cell.label} metal={medalMetal(cell.ratio, cell.future)} />
            </li>
          ))}
        </ol>
      </section>

      <section className="home-module" aria-label="今年读完">
        <h2>今年读完</h2>
        <p className="home-year-count">
          已完成 {finishedAll.length} 本 · 目标 {reading.yearGoal} 本
        </p>
        <div className="home-progress" aria-hidden="true">
          <i style={{ width: `${Math.round(Math.min(1, finishedAll.length / reading.yearGoal) * 100)}%` }} />
        </div>
        {finished.length === 0 ? (
          <p className="phone-quiet">今年还没有读完的书。</p>
        ) : (
          <div className="home-year-row">
            {finished.map((book) => (
              <YearBook key={book.id} book={book} parsing={parseFractionOf(parseGates, book.id)} onOpen={onOpen} />
            ))}
          </div>
        )}
        <button
          className="home-goal-open"
          type="button"
          onPointerUp={(event) => menuPress(event, () => setGoal('year'))}
        >
          今年目标
        </button>
      </section>
      {goal === 'day' ? (
        <HomeGoalSheet title="设置目标" onClose={() => setGoal(null)}>
          <WheelPicker
            label="每日目标"
            values={DAY_GOAL_STOPS}
            value={reading.dayGoal}
            format={(value) => `${value} 分钟`}
            onChange={(dayGoal) => save({ ...reading, dayGoal })}
          />
          <p className="home-wheel-caption">每日目标</p>
        </HomeGoalSheet>
      ) : null}
      {goal === 'year' ? (
        <HomeGoalSheet title="今年目标" onClose={() => setGoal(null)}>
          <div className="home-wheels">
            <div>
              <WheelPicker
                label="展示本数"
                values={YEAR_SHOW_STOPS}
                value={reading.yearShow}
                format={(value) => `${value} 本`}
                onChange={(yearShow) => save({ ...reading, yearShow })}
              />
              <p className="home-wheel-caption">展示本数</p>
            </div>
            <div>
              <WheelPicker
                label="今年目标"
                values={YEAR_GOAL_STOPS}
                value={reading.yearGoal}
                format={(value) => `${value} 本`}
                onChange={(yearGoal) => save({ ...reading, yearGoal })}
              />
              <p className="home-wheel-caption">今年目标</p>
            </div>
          </div>
        </HomeGoalSheet>
      ) : null}
    </section>
  )
}

function weekLabel(label: string, seconds: number, future: boolean): string {
  if (future) return `周${label} 未到`
  if (seconds <= 0) return `周${label} 还没读`
  return `周${label} ${durationLabel(seconds)}`
}

function Gauge({ ratio, label }: { ratio: number; label: string }) {
  const length = Math.PI * 46
  const dash = Math.max(0, Math.min(1, ratio)) * length
  return (
    <svg className="home-gauge" viewBox="0 0 120 72" role="img" aria-label={label}>
      <path
        d="M14 60 A46 46 0 0 1 106 60"
        fill="none"
        stroke="color-mix(in srgb, var(--fg) 16%, transparent)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {dash > 0 ? (
        <path
          d="M14 60 A46 46 0 0 1 106 60"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${length}`}
        />
      ) : null}
    </svg>
  )
}
