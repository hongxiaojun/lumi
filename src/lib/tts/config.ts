import type { TtsConfig } from '../../types'

export const DEFAULT_TTS: TtsConfig = {
  provider: 'system',
  rate: 1,
  systemVoice: '',
  cloudBaseUrl: 'https://api.openai.com/v1',
  cloudKey: '',
  cloudModel: 'gpt-4o-mini-tts',
  cloudVoice: 'alloy',
  cloudInstructions: '用自然、温和的语气朗读，像在讲故事，句间留一点呼吸。',
  azureRegion: 'eastasia',
  azureKey: '',
  azureVoice: 'zh-CN-XiaoxiaoNeural',
  listenLayout: true,
  listenFontSize: 26,
  listenLineHeight: 2.05,
  immersive: true,
}

export const RATE_MIN = 0.6
export const RATE_MAX = 2
export const RATE_STEPS = [0.8, 1, 1.25, 1.5, 2] as const

export const LISTEN_SIZE_MIN = 18
export const LISTEN_SIZE_MAX = 34
export const LISTEN_LEADING_MIN = 1.6
export const LISTEN_LEADING_MAX = 2.6

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1
  return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(rate * 100) / 100))
}

export function nextRate(rate: number): number {
  const at = RATE_STEPS.findIndex((step) => step > rate + 0.001)
  return at < 0 ? RATE_STEPS[0] : RATE_STEPS[at]
}

export function rateLabel(rate: number): string {
  const value = clampRate(rate)
  const hundredths = Math.round(value * 100)
  const text = hundredths % 10 === 0 ? value.toFixed(1) : value.toFixed(2)
  return `${text}×`
}

/** Quick picks, plus the saved rate when it is not already one of them. */
export function rateChoices(rate: number): number[] {
  const steps: number[] = [...RATE_STEPS]
  const current = clampRate(rate)
  if (!steps.some((step) => Math.abs(step - current) < 0.001)) steps.push(current)
  steps.sort((a, b) => a - b)
  return steps
}

export function speechLang(language: string | undefined, text: string): string {
  if (language === 'en') return 'en-US'
  if (language === 'zh' || language === 'mixed') return 'zh-CN'
  return /[\u3400-\u9fff]/.test(text) ? 'zh-CN' : 'en-US'
}

/** Keep the configured voice only when it still exists; otherwise pick a locale match. */
export function pickVoice<T extends { id: string; lang: string }>(
  voices: readonly T[],
  wanted: string,
  lang: string,
): T | null {
  if (wanted) {
    const exact = voices.find((voice) => voice.id === wanted)
    if (exact) return exact
  }
  const prefix = lang.split('-')[0]?.toLowerCase()
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix ?? '')) ?? voices[0] ?? null
}

/** A pasted key often carries a Bearer prefix, quotes, or invisible spaces. */
export function cleanSecret(value: string): string {
  let text = value.replace(/[\u200B-\u200D\uFEFF\u00A0\u3000]/g, '').trim()
  text = text.replace(/^bearer\s+/i, '').trim()
  text = text.replace(/^['"`]+|['"`]+$/g, '').trim()
  text = text.replace(/^bearer\s+/i, '').trim()
  return text.replace(/\s+/g, '')
}

/** Apply one settings change onto the latest config. Callers pass only the
 * field they edited, so a voice pick cannot wipe a key that was just pasted. */
export function mergeTts(current: TtsConfig, patch: Partial<TtsConfig>): TtsConfig {
  const next = normalizeTts({ ...current, ...patch })
  if (typeof patch.cloudKey === 'string') next.cloudKey = cleanSecret(patch.cloudKey)
  if (typeof patch.azureKey === 'string') next.azureKey = cleanSecret(patch.azureKey)
  return next
}

export function normalizeTts(stored: Partial<TtsConfig> | undefined | null): TtsConfig {
  if (!stored) return { ...DEFAULT_TTS }
  const provider =
    stored.provider === 'cloud' || stored.provider === 'azure' ? stored.provider : 'system'
  return {
    ...DEFAULT_TTS,
    ...stored,
    provider,
    rate: clampRate(typeof stored.rate === 'number' ? stored.rate : DEFAULT_TTS.rate),
    systemVoice: typeof stored.systemVoice === 'string' ? stored.systemVoice : DEFAULT_TTS.systemVoice,
    cloudBaseUrl: textOr(stored.cloudBaseUrl, DEFAULT_TTS.cloudBaseUrl),
    cloudKey: typeof stored.cloudKey === 'string' ? stored.cloudKey : '',
    cloudModel: textOr(stored.cloudModel, DEFAULT_TTS.cloudModel),
    cloudVoice: textOr(stored.cloudVoice, DEFAULT_TTS.cloudVoice),
    cloudInstructions:
      typeof stored.cloudInstructions === 'string' ? stored.cloudInstructions : DEFAULT_TTS.cloudInstructions,
    azureRegion: textOr(stored.azureRegion, DEFAULT_TTS.azureRegion),
    azureKey: typeof stored.azureKey === 'string' ? stored.azureKey : '',
    azureVoice: textOr(stored.azureVoice, DEFAULT_TTS.azureVoice),
    listenLayout: stored.listenLayout !== false,
    listenFontSize: numberOr(stored.listenFontSize, DEFAULT_TTS.listenFontSize, LISTEN_SIZE_MIN, LISTEN_SIZE_MAX),
    listenLineHeight: numberOr(
      stored.listenLineHeight,
      DEFAULT_TTS.listenLineHeight,
      LISTEN_LEADING_MIN,
      LISTEN_LEADING_MAX,
    ),
    immersive: stored.immersive !== false,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100))
}

function numberOr(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

function textOr(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed : fallback
}
