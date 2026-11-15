// 临时排查用：把进度落盘的每一环写进 localStorage，供真机取证后删除。
const KEY = 'lumi.trace.persist'
const LIMIT = 400

type Row = { t: number; e: string; d?: unknown }

export function trace(event: string, data?: unknown): void {
  try {
    const raw = localStorage.getItem(KEY)
    const rows: Row[] = raw ? (JSON.parse(raw) as Row[]) : []
    rows.push({ t: Date.now(), e: event, d: data })
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-LIMIT)))
  } catch {
    // 排查代码不许影响阅读
  }
}

export function readTrace(): Row[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Row[]) : []
  } catch {
    return []
  }
}
