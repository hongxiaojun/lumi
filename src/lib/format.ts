type LangMap = string | Record<string, string> | undefined | null
type Contributor =
  | string
  | { name?: LangMap }
  | Array<string | { name?: LangMap }>
  | undefined
  | null

export function formatLangMap(value: LangMap): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  const keys = Object.keys(value)
  return keys.length ? value[keys[0]] ?? '' : ''
}

export function formatAuthor(contributor: Contributor): string {
  if (!contributor) return ''
  if (typeof contributor === 'string') return contributor
  if (Array.isArray(contributor)) {
    return contributor
      .map((item) => formatAuthor(item))
      .filter(Boolean)
      .join(' · ')
  }
  return formatLangMap(contributor.name)
}

export function clampFraction(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** The cover badge and the shelf index share this line. */
export const FINISHED_FRACTION = 0.98

export function readingPlace(fraction: number | null | undefined): 'unread' | 'reading' | 'finished' {
  const n = clampFraction(fraction)
  if (n >= FINISHED_FRACTION) return 'finished'
  if (n > 0) return 'reading'
  return 'unread'
}

export function percentLabel(fraction: number | null | undefined): string {
  const n = clampFraction(fraction)
  return `${Math.round(n * 1000) / 10}%`
}

export function sliderSteps(fraction: number | null | undefined, steps = 1000): number {
  return Math.round(clampFraction(fraction) * steps)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NEW_IMPORT = 7 * DAY

function startOfLocalDay(time: number): number {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function openedPhrase(at: number | null | undefined, now = Date.now()): string {
  if (!at) return '还没打开'
  const delta = now - at
  if (delta < MINUTE) return '刚刚'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} 分钟前`
  if (delta < DAY) return `${Math.max(1, Math.floor(delta / HOUR))} 小时前`
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(at)) / DAY)
  if (days <= 1) return '昨天'
  if (days < 7) return `${days} 天前`
  const date = new Date(at)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function shelfMarks(
  book: { addedAt: number; lastOpenedAt: number | null; fraction: number },
  now = Date.now(),
): { badge: '新导入' | '已读完' | null; opened: string; progress: string } {
  const fraction = clampFraction(book.fraction)
  const place = readingPlace(fraction)
  const finished = place === 'finished'
  const fresh =
    !book.lastOpenedAt &&
    fraction === 0 &&
    book.addedAt <= now &&
    now - book.addedAt <= NEW_IMPORT
  let progress = '还没开始'
  if (finished) progress = '已经读完'
  else if (place === 'reading') progress = percentLabel(fraction)
  return {
    badge: fresh ? '新导入' : finished ? '已读完' : null,
    opened: openedPhrase(book.lastOpenedAt, now),
    progress,
  }
}
