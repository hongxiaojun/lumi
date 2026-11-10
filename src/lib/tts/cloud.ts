import type { TtsConfig } from '../../types'
import { appFetch } from '../appFetch'
import { clampRate, cleanSecret, DEFAULT_TTS } from './config'
import type { SpeakHandle, Speaker } from './types'

export type SpeechRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

/** OpenAI-compatible speech lives at /audio/speech under the API root. */
export function speechEndpoint(base: string): string {
  const raw = (base || DEFAULT_TTS.cloudBaseUrl).trim().replace(/\/+$/, '')
  if (/\/audio\/speech$/i.test(raw)) return raw
  if (/\/v1$/i.test(raw)) return `${raw}/audio/speech`
  return `${raw}/v1/audio/speech`
}

/** CosyVoice has no OpenAI `instructions` field. The same words go in front of
 * the sentence, and the service does not speak that prefix. */
export function siliconFlow(base: string): boolean {
  return /siliconflow\.(cn|com)/i.test(base)
}

export function speechRequest(text: string, config: TtsConfig): SpeechRequest {
  const instructions = config.cloudInstructions.trim()
  const silicon = siliconFlow(config.cloudBaseUrl)
  const body: Record<string, unknown> = {
    model: config.cloudModel || DEFAULT_TTS.cloudModel,
    input: silicon && instructions ? `${instructions}<|endofprompt|>${text}` : text,
    voice: config.cloudVoice || DEFAULT_TTS.cloudVoice,
    response_format: 'mp3',
    speed: clampRate(config.rate),
  }
  if (instructions && !silicon) body.instructions = instructions
  return {
    url: speechEndpoint(config.cloudBaseUrl),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanSecret(config.cloudKey)}`,
    },
    body: JSON.stringify(body),
  }
}

/** Pull `message` out of a JSON error body. Other text is kept, shortened. */
export function errorHint(detail: string): string {
  const trimmed = detail.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  try {
    const body = JSON.parse(trimmed) as { message?: unknown; error?: unknown }
    const message =
      typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : ''
    if (message.trim()) return message.trim().slice(0, 80)
  } catch {
    // The body is not JSON. Show it as text.
  }
  return trimmed.slice(0, 80)
}

export function authRejected(label: string, detail: string): string {
  const hint = errorHint(detail)
  return hint ? `${label}没有被接受：${hint}` : `${label}没有被接受`
}

export async function fetchSpeech(text: string, config: TtsConfig): Promise<Blob> {
  if (!cleanSecret(config.cloudKey)) throw new Error('请先填写云端朗读的接口密钥')
  const request = speechRequest(text, config)
  const fetchFn = await appFetch()
  let res: Response
  try {
    res = await fetchFn(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })
  } catch (error) {
    throw new Error(`云端朗读请求没有发出去：${errorText(error)}`)
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const hint = errorHint(detail)
    if (res.status === 401 || res.status === 403) throw new Error(authRejected('云端朗读密钥', detail))
    if (res.status === 429) throw new Error('云端朗读限流，请稍后再试')
    throw new Error(hint ? `云端朗读 ${res.status}：${hint}` : `云端朗读 ${res.status}`)
  }
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail ? `云端朗读没有返回声音：${detail.slice(0, 100)}` : '云端朗读没有返回声音')
  }
  return new Blob([await res.arrayBuffer()], { type: type || 'audio/mpeg' })
}

/** The HTTP plugin can reject with a plain string, so do not lose the reason. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    const text = JSON.stringify(error)
    if (text && text !== '{}') return text
  } catch {
    // fall through
  }
  return String(error)
}

let audioEl: HTMLAudioElement | null = null
let prepared = false
let objectUrl = ''

/**
 * Sentences already fetched or being fetched, keyed by the full speech request
 * body (text, voice, model, speed, instructions). Lives at module level because
 * useReadAloud builds a fresh cloudSpeaker per sentence. A rejected fetch drops
 * its entry so the retry speaks to the network again.
 */
const pending = new Map<string, Promise<Blob>>()
const PENDING_MAX = 6

function pendingSpeech(text: string, config: TtsConfig): Promise<Blob> {
  const key = speechRequest(text, config).body
  const hit = pending.get(key)
  if (hit) return hit
  const fetching = fetchSpeech(text, config).catch((error: unknown) => {
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
export async function prefetchSpeech(texts: readonly string[], config: TtsConfig): Promise<void> {
  await Promise.all(
    texts
      .filter((text) => Boolean(text))
      .map((text) =>
        pendingSpeech(text, config).catch(() => {
          // A failed prefetch drops its own cache entry; playback retries on demand.
        }),
      ),
  )
}

function audio(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (!audioEl) {
    audioEl = document.createElement('audio')
    audioEl.preload = 'auto'
    audioEl.setAttribute('playsinline', '')
  }
  return audioEl
}

/** Call synchronously from the tap that starts speaking. iOS unlocks playback for this element. */
export function unlockAudio(): void {
  const el = audio()
  if (!el || prepared) return
  prepared = true
  el.src = SILENT_WAV
  void el.play().then(
    () => {
      el.pause()
      el.currentTime = 0
    },
    () => {
      prepared = false
    },
  )
}

function release(el: HTMLAudioElement): void {
  el.onended = null
  el.onerror = null
  el.onplaying = null
  el.pause()
  el.removeAttribute('src')
  el.load()
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
}

/**
 * Blob playback shared by the cloud and Azure speakers: one audio element,
 * fetch the current sentence, warm the upcoming ones through the provider's
 * own cache. `fetchOne` rejects with a readable message on failure.
 */
export function blobSpeaker(
  fetchOne: (text: string) => Promise<Blob>,
  warmup?: (texts: readonly string[]) => void,
): Speaker {
  return (unit, handlers, upcoming): SpeakHandle => {
    const el = audio()
    if (!el) {
      queueMicrotask(() => handlers.onError(new Error('这台设备不能播放这段朗读')))
      return { cancel: () => {} }
    }
    release(el)
    let cancelled = false
    let started = false

    const start = () => {
      if (started || cancelled) return
      started = true
      handlers.onStart()
    }

    // Fetch the next sentences now so sentence turns play from cache instead of
    // waiting on a network round trip. Same request count, just earlier.
    warmup?.((upcoming ?? []).map((next) => next.text))

    fetchOne(unit.text).then(
      (blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        el.src = objectUrl
        el.onplaying = () => {
          if (!cancelled) start()
        }
        el.onended = () => {
          if (!cancelled) handlers.onEnd()
        }
        el.onerror = () => {
          if (!cancelled) handlers.onError(new Error('这段语音没有播放出来'))
        }
        void el.play().then(
          () => start(),
          () => {
            if (!cancelled) handlers.onError(new Error('点一下播放按钮再试，浏览器需要这次点击'))
          },
        )
      },
      (error) => {
        if (!cancelled) handlers.onError(error)
      },
    )

    return {
      cancel() {
        cancelled = true
        release(el)
      },
      pause() {
        if (cancelled || !el.src) return false
        el.pause()
        return true
      },
      resume() {
        if (cancelled || !el.src) return false
        void el.play().then(
          () => start(),
          () => handlers.onError(new Error('这段语音没有接着播放')),
        )
        return true
      },
    }
  }
}

export function cloudSpeaker(config: TtsConfig): Speaker {
  return blobSpeaker(
    (text) => pendingSpeech(text, config),
    (texts) => {
      for (const text of texts) void pendingSpeech(text, config).catch(() => {})
    },
  )
}

// 0.1 s of silence. iOS accepts this as a real play() during the starting tap.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
