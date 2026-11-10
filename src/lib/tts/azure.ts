import type { TtsConfig } from '../../types'
import { appFetch } from '../appFetch'
import { DEFAULT_TTS, clampRate } from './config'
import { blobSpeaker, errorText } from './cloud'
import type { Speaker } from './types'

/** Compact mp3: good enough for speech, small enough for quick sentence turns. */
export const AZURE_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

/**
 * Accepts a bare region name (eastasia), a full host
 * (https://myres.cognitiveservices.azure.com), or a full endpoint, and always
 * answers with a POST-able /cognitiveservices/v1 URL.
 */
export function azureEndpoint(region: string): string {
  const raw = (region || DEFAULT_TTS.azureRegion).trim().replace(/\/+$/, '')
  if (/cognitiveservices\/v1$/i.test(raw)) return raw
  if (/^https?:\/\//i.test(raw)) return `${raw}/cognitiveservices/v1`
  return `https://${raw.toLowerCase()}.tts.speech.microsoft.com/cognitiveservices/v1`
}

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** zh-CN-XiaoxiaoNeural -> zh-CN; names without a locale prefix fall back to zh-CN. */
export function azureVoiceLang(voice: string): string {
  const parts = voice.trim().split('-')
  if (parts.length >= 3 && /^[a-z]{2,3}$/i.test(parts[0]) && /^[A-Z]{2,3}$/.test(parts[1])) {
    return `${parts[0]}-${parts[1]}`
  }
  return 'zh-CN'
}

/** Azure rate is a percentage offset from normal, e.g. 1.2x speaks as +20%. */
export function azureSsml(text: string, config: TtsConfig): string {
  const voice = (config.azureVoice || DEFAULT_TTS.azureVoice).trim()
  const lang = azureVoiceLang(voice)
  const pct = Math.round((clampRate(config.rate) - 1) * 100)
  const sign = pct < 0 ? '-' : '+'
  return (
    `<speak version='1.0' xml:lang='${lang}'>` +
    `<voice name='${escapeXml(voice)}' xml:lang='${lang}'>` +
    `<prosody rate='${sign}${Math.abs(pct)}%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  )
}

export async function fetchAzureSpeech(text: string, config: TtsConfig): Promise<Blob> {
  if (!config.azureKey.trim()) throw new Error('请先填写 Azure 朗读的密钥')
  const region = config.azureRegion.trim()
  if (!region) throw new Error('请先填写 Azure 朗读的区域')
  const url = azureEndpoint(region)
  const fetchFn = await appFetch()
  let res: Response
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.azureKey.trim(),
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
        'User-Agent': 'Lumi-leaf-reader',
      },
      body: azureSsml(text, config),
    })
  } catch (error) {
    throw new Error(`Azure 朗读请求没有发出去：${errorText(error)}`)
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const hint = detail.replace(/\s+/g, ' ').trim().slice(0, 100)
    if (res.status === 401 || res.status === 403) throw new Error('Azure 朗读密钥没有被接受（也检查区域是否对得上）')
    if (res.status === 429) throw new Error('Azure 朗读限流，请稍后再试')
    throw new Error(hint ? `Azure 朗读 ${res.status}：${hint}` : `Azure 朗读 ${res.status}`)
  }
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail ? `Azure 朗读没有返回声音：${detail.slice(0, 100)}` : 'Azure 朗读没有返回声音')
  }
  return new Blob([await res.arrayBuffer()], { type: type || 'audio/mpeg' })
}

/**
 * Sentences already fetched or being fetched, keyed by endpoint + ssml (text,
 * voice, rate). Lives at module level because useReadAloud builds a fresh
 * azureSpeaker per sentence. A rejected fetch drops its entry so the retry
 * speaks to the network again.
 */
const pending = new Map<string, Promise<Blob>>()
const PENDING_MAX = 6

function pendingAzureSpeech(text: string, config: TtsConfig): Promise<Blob> {
  const key = JSON.stringify({ url: azureEndpoint(config.azureRegion), ssml: azureSsml(text, config) })
  const hit = pending.get(key)
  if (hit) return hit
  const fetching = fetchAzureSpeech(text, config).catch((error: unknown) => {
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

export function azureSpeaker(config: TtsConfig): Speaker {
  return blobSpeaker(
    (text) => pendingAzureSpeech(text, config),
    (texts) => {
      for (const text of texts) void pendingAzureSpeech(text, config).catch(() => {})
    },
  )
}

/** Warm the cache from outside the player, e.g. the next chapter's opening sentences. */
export async function prefetchAzureSpeech(texts: readonly string[], config: TtsConfig): Promise<void> {
  await Promise.all(
    texts
      .filter((text) => Boolean(text))
      .map((text) =>
        pendingAzureSpeech(text, config).catch(() => {
          // A failed prefetch drops its own cache entry; playback retries on demand.
        }),
      ),
  )
}
