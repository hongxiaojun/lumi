import type { PreparedRequest } from './engines'
import { appFetch } from '../appFetch'

export async function sendRaw(req: PreparedRequest): Promise<string> {
  const fetchFn = await appFetch()
  const res = await fetchFn(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  })
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 429) throw new Error('翻译接口限流，请稍后再试，或换一个引擎')
    const hint = text.slice(0, 80).replace(/\s+/g, ' ').trim()
    throw new Error(hint ? `翻译接口 ${res.status}：${hint}` : `翻译接口 ${res.status}`)
  }
  return text
}

export async function sendJson(req: PreparedRequest): Promise<unknown> {
  const text = await sendRaw(req)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('翻译接口返回不是 JSON')
  }
}
