import type { TtsConfig } from '../../types'
import { appFetch } from '../appFetch'
import { blobSpeaker, errorHint, errorText } from './cloud'
import { clampRate, cleanSecret, DEFAULT_TTS } from './config'
import type { Speaker } from './types'

/**
 * DeepSeek's speech tool, not an OpenAI-compatible /audio/speech endpoint.
 * It returns wav bytes in the response body and has no server-side speed,
 * so playback rate is applied on the local audio element.
 */
export const DEEPSEEK_TTS_URL = 'https://api.deepseek.com/v1/tools/tts'

export type DeepSeekRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

export function deepseekRequest(text: string, config: TtsConfig): DeepSeekRequest {
  return {
    url: DEEPSEEK_TTS_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanSecret(config.deepseekKey)}`,
    },
    body: JSON.stringify({
      text,
      voice_id: config.deepseekVoice.trim() || DEFAULT_TTS.deepseekVoice,
      format: 'wav',
      filter_markdown: true,
    }),
  }
}

export async function fetchDeepSeekSpeech(text: string, config: TtsConfig): Promise<Blob> {
  if (!cleanSecret(config.deepseekKey)) throw new Error('请先填写 DeepSeek 朗读的接口密钥')
  const request = deepseekRequest(text, config)
  const fetchFn = await appFetch()
  let res: Response
  try {
    res = await fetchFn(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })
  } catch (error) {
    throw new Error(`DeepSeek 朗读请求没有发出去：${errorText(error)}`)
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const hint = errorHint(detail)
    if (res.status === 401 || res.status === 403) throw new Error(authMessage(detail))
    if (res.status === 429) throw new Error('DeepSeek 朗读限流，请稍后再试')
    if (res.status === 503) throw new Error('DeepSeek 朗读正忙，请稍后再试')
    if (res.status === 504) throw new Error('DeepSeek 朗读超时，这一段没合成出来')
    if (res.status === 400 && /content exists risk/i.test(detail)) {
      throw new Error('这段文字没有通过 DeepSeek 的内容审核')
    }
    throw new Error(hint ? `DeepSeek 朗读 ${res.status}：${hint}` : `DeepSeek 朗读 ${res.status}`)
  }
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail ? `DeepSeek 朗读没有返回声音：${detail.slice(0, 100)}` : 'DeepSeek 朗读没有返回声音')
  }
  return new Blob([await res.arrayBuffer()], { type: type || 'audio/wav' })
}

function authMessage(detail: string): string {
  const hint = errorHint(detail)
  return hint ? `DeepSeek 朗读密钥没有被接受：${hint}` : 'DeepSeek 朗读密钥没有被接受'
}

/**
 * Sentences already fetched or being fetched, keyed by the request body (text
 * and voice). Lives at module level because useReadAloud builds a fresh
 * deepseekSpeaker per sentence. A rejected fetch drops its entry so the retry
 * speaks to the network again.
 */
const pending = new Map<string, Promise<Blob>>()
const PENDING_MAX = 6

function pendingDeepSeekSpeech(text: string, config: TtsConfig): Promise<Blob> {
  const key = deepseekRequest(text, config).body
  const hit = pending.get(key)
  if (hit) return hit
  const fetching = fetchDeepSeekSpeech(text, config).catch((error: unknown) => {
    pending.delete(key)
    throw error
  })
  pending.set(key, fetching)
  while (pending.size > PENDING_MAX) {
    const oldest = pending.keys().next().value
    if (oldest === undefined) break
    pending.delete(oldest)
  }
  return fetching
}

/** Warm the cache from outside the player, e.g. the next chapter's opening sentences. */
export async function prefetchDeepSeekSpeech(texts: readonly string[], config: TtsConfig): Promise<void> {
  await Promise.all(
    texts
      .filter((text) => Boolean(text))
      .map((text) =>
        pendingDeepSeekSpeech(text, config).catch(() => {
          // A failed prefetch drops its own cache entry; playback retries on demand.
        }),
      ),
  )
}

export function deepseekSpeaker(config: TtsConfig): Speaker {
  return blobSpeaker(
    (text) => pendingDeepSeekSpeech(text, config),
    (texts) => {
      for (const text of texts) void pendingDeepSeekSpeech(text, config).catch(() => {})
    },
    clampRate(config.rate),
  )
}
