import type { TtsConfig } from '../../types'
import { appFetch } from '../appFetch'
import { azureEndpoint } from './azure'
import { authRejected, errorHint, errorText } from './cloud'
import { cleanSecret } from './config'

/**
 * Voice and model catalogs for the speech providers. Everything here is
 * best-effort: a failed or unrecognized catalog falls back to the free-text
 * fields the settings sheet already has, so a compatible service is never
 * locked out by a guess.
 */

const SPEECH_MODEL_HINTS = /tts|speech|voice|cosy|fish-|audio|moss|walter|melo|bark/i

/** Keeps only speech-looking model ids; shows everything when nothing matches. */
export function filterTtsModels(models: readonly string[]): string[] {
  const hits = models.filter((id) => SPEECH_MODEL_HINTS.test(id))
  return hits.length > 0 ? hits : [...models]
}

/** A dropdown entry for a model or voice catalog. */
export type CatalogOption = { id: string; label: string }

/** SiliconFlow's documented CosyVoice2 system presets (no API serves them). */
export type CloudVoicePreset = CatalogOption

const COSYVOICE_PRESETS: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'alex', label: 'Alex · 沉稳男声' },
  { name: 'benjamin', label: 'Benjamin · 低沉男声' },
  { name: 'charles', label: 'Charles · 磁性男声' },
  { name: 'david', label: 'David · 欢快男声' },
  { name: 'anna', label: 'Anna · 沉稳女声' },
  { name: 'bella', label: 'Bella · 激情女声' },
  { name: 'claire', label: 'Claire · 温柔女声' },
  { name: 'diana', label: 'Diana · 欢快女声' },
]

const OPENAI_VOICES: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'alloy', label: 'Alloy · 中性' },
  { name: 'echo', label: 'Echo · 男声' },
  { name: 'fable', label: 'Fable · 男声' },
  { name: 'onyx', label: 'Onyx · 低沉男声' },
  { name: 'nova', label: 'Nova · 女声' },
  { name: 'shimmer', label: 'Shimmer · 女声' },
  { name: 'cherry', label: 'Cherry · 温暖女声' },
  { name: 'verse', label: 'Verse · 男声' },
]

/**
 * Preset voices for the services we recognize, or null when the base URL is
 * unknown and the voice field should stay free-form.
 */
export function cloudVoicePresets(baseUrl: string, model: string): CloudVoicePreset[] | null {
  const base = baseUrl.toLowerCase()
  if (base.includes('siliconflow.cn')) {
    const prefix = model.includes(':') ? '' : `${model}:`
    return COSYVOICE_PRESETS.map((voice) => ({ id: `${prefix}${voice.name}`, label: voice.label }))
  }
  if (base.includes('api.openai.com')) {
    return OPENAI_VOICES.map((voice) => ({ id: voice.name, label: voice.label }))
  }
  return null
}

function headers(config: TtsConfig): Record<string, string> {
  const key = config.provider === 'azure' ? config.azureKey : config.cloudKey
  return { Authorization: `Bearer ${cleanSecret(key)}` }
}

/** GET {base}/models, inserting /v1 when the user stopped at the host. */
export function modelsEndpoint(base: string): string {
  const raw = base.trim().replace(/\/+$/, '')
  if (/\/models$/i.test(raw)) return raw
  if (/\/v1$/i.test(raw)) return `${raw}/models`
  return `${raw}/v1/models`
}

async function fetchJson(url: string, config: TtsConfig, what: string): Promise<unknown> {
  const key = config.provider === 'azure' ? config.azureKey : config.cloudKey
  if (!cleanSecret(key)) throw new Error(`请先填写${what}的密钥`)
  const fetchFn = await appFetch()
  let res: Response
  try {
    res = await fetchFn(url, { method: 'GET', headers: headers(config) })
  } catch (error) {
    throw new Error(`${what}列表没有拉下来：${errorText(error)}`)
  }
  if (res.status === 401 || res.status === 403) {
    const detail = await res.text().catch(() => '')
    throw new Error(authRejected(`${what}的密钥`, detail))
  }
  if (res.status === 429) throw new Error(`${what}限流，请稍后再试`)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const hint = errorHint(detail)
    throw new Error(hint ? `${what}列表拉取失败（${res.status}）：${hint}` : `${what}列表拉取失败（${res.status}）`)
  }
  try {
    return await res.json()
  } catch {
    throw new Error(`${what}列表不是约定的格式`)
  }
}

/** GET {base}/models, filtered down to speech-looking ids. */
export async function listCloudModels(config: TtsConfig): Promise<string[]> {
  const base = config.cloudBaseUrl.trim()
  if (!base) throw new Error('请先填写接口地址')
  const url = modelsEndpoint(base)
  const body = (await fetchJson(url, config, '模型')) as { data?: Array<{ id?: unknown }> }
  const ids = Array.isArray(body?.data)
    ? body.data.filter((row) => typeof row?.id === 'string').map((row) => row.id as string)
    : []
  if (ids.length === 0) throw new Error('模型列表没有可用的模型')
  return filterTtsModels(ids)
}

export type AzureVoiceOption = CatalogOption

/** GET the Azure neural voice catalog, Chinese locales first, then by locale and name. */
export async function listAzureVoices(config: TtsConfig): Promise<AzureVoiceOption[]> {
  const region = config.azureRegion.trim()
  if (!region) throw new Error('请先填写 Azure 的区域')
  const listUrl = azureEndpoint(region).replace('/cognitiveservices/v1', '/tts/cognitiveservices/voices/list')
  const body = (await fetchJson(listUrl, config, 'Azure 声音')) as Array<{
    ShortName?: unknown
    DisplayName?: unknown
    Locale?: unknown
  }>
  if (!Array.isArray(body)) throw new Error('Azure 声音列表不是约定的格式')
  const voices = body
    .filter((row) => typeof row?.ShortName === 'string')
    .map((row) => ({
      id: row.ShortName as string,
      label:
        typeof row.DisplayName === 'string' && typeof row.Locale === 'string'
          ? `${row.DisplayName} · ${row.Locale}`
          : (row.ShortName as string),
    }))
  if (voices.length === 0) throw new Error('Azure 声音列表没有可用的声音')
  const isZh = (id: string) => id.toLowerCase().startsWith('zh')
  const key = (v: AzureVoiceOption) => [isZh(v.id) ? 0 : 1, v.label, v.id] as const
  return voices.sort((a, b) => {
    const [az, aa, ai] = key(a)
    const [bz, ba, bi] = key(b)
    return az - bz || aa.localeCompare(ba, 'zh') || ai.localeCompare(bi)
  })
}
