import { microsoftLang } from './lang'

export type EngineId = 'google' | 'microsoft' | 'ai'

export type TranslatorSecrets = {
  googleKey: string
  microsoftKey: string
  microsoftRegion: string
  aiBaseUrl: string
  aiKey: string
  aiModel: string
}

export type PreparedRequest = {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
}

export const DEFAULT_SECRETS: TranslatorSecrets = {
  googleKey: '',
  microsoftKey: '',
  microsoftRegion: 'eastasia',
  aiBaseUrl: 'https://api.openai.com/v1',
  aiKey: '',
  aiModel: 'gpt-4o-mini',
}

const GOOGLE_PA_KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO52U'

export function googleRequest(texts: string[], from: string, to: string, key: string): PreparedRequest {
  const params = new URLSearchParams({ key })
  return {
    url: `https://translation.googleapis.com/language/translate/v2?${params}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, source: from, target: to, format: 'text' }),
  }
}

export function googlePaRequest(texts: string[], from: string, to: string): PreparedRequest {
  const params = new URLSearchParams({
    client: 'gtx',
    'query.source_language': from === 'zh-CN' ? 'zh-CN' : from,
    'query.target_language': to === 'zh-CN' ? 'zh-CN' : to,
    'query.text': texts.join('\n'),
    key: GOOGLE_PA_KEY,
    data_types: 'TRANSLATION',
  })
  return {
    url: `${googlePaOrigin()}/v1/translate?${params}`,
    method: 'GET',
    headers: {},
  }
}

export function googleGtxRequest(texts: string[], from: string, to: string): PreparedRequest {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: from === 'zh-CN' ? 'zh-CN' : from,
    tl: to === 'zh-CN' ? 'zh-CN' : to,
    dt: 't',
    q: texts.join('\n'),
  })
  return {
    url: `${googleGtxOrigin()}/translate_a/single?${params}`,
    method: 'GET',
    headers: {},
  }
}

export function parseGooglePa(payload: unknown, expected: number): string[] {
  const translation = (payload as { translation?: string })?.translation
  if (typeof translation !== 'string') throw new Error('谷歌翻译返回无法解析')
  return pad(translation.split('\n'), expected)
}

export function parseGoogle(payload: unknown, expected: number): string[] {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const data = payload as { data?: { translations?: { translatedText: string }[] } }
    const rows = data.data?.translations ?? []
    return pad(rows.map((r) => decodeHtml(r.translatedText)), expected)
  }
  if (Array.isArray(payload) && Array.isArray(payload[0])) {
    const joined = (payload[0] as [string][]).map((row) => row[0] ?? '').join('')
    const lines = joined.split('\n')
    return pad(lines, expected)
  }
  throw new Error('谷歌翻译返回无法解析')
}

export function microsoftRequest(
  texts: string[],
  from: string,
  to: string,
  key: string,
  region: string,
): PreparedRequest {
  const params = new URLSearchParams({
    'api-version': '3.0',
    from: microsoftLang(from),
    to: microsoftLang(to),
  })
  return {
    url: `https://api.cognitive.microsofttranslator.com/translate?${params}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
      'Ocp-Apim-Subscription-Region': region,
    },
    body: JSON.stringify(texts.map((text) => ({ Text: text }))),
  }
}

export function parseMicrosoft(payload: unknown, expected: number): string[] {
  if (!Array.isArray(payload)) throw new Error('微软翻译返回无法解析')
  const rows = payload.map((item) => {
    const translations = (item as { translations?: { text: string }[] }).translations
    return translations?.[0]?.text ?? ''
  })
  return pad(rows, expected)
}

export function aiFlavor(base: string): 'openai' | 'anthropic' {
  const raw = base.trim().toLowerCase()
  if (raw.includes('anthropic') || /\/v1\/messages\/?$/.test(raw) || /\/messages\/?$/.test(raw)) {
    return 'anthropic'
  }
  return 'openai'
}

export function aiEndpoint(base: string): { url: string; flavor: 'openai' | 'anthropic' } {
  const trimmed = base.trim().replace(/\/+$/, '')
  const flavor = aiFlavor(trimmed)
  if (flavor === 'anthropic') {
    if (/\/messages$/i.test(trimmed)) return { url: trimmed, flavor }
    if (/\/v1$/i.test(trimmed)) return { url: `${trimmed}/messages`, flavor }
    return { url: `${trimmed}/v1/messages`, flavor }
  }
  if (/\/chat\/completions$/i.test(trimmed)) return { url: trimmed, flavor }
  return { url: `${trimmed}/chat/completions`, flavor }
}

export function aiRequest(
  texts: string[],
  from: string,
  to: string,
  secrets: TranslatorSecrets,
): PreparedRequest {
  const { url, flavor } = aiEndpoint(secrets.aiBaseUrl)
  const target = to.startsWith('zh') ? 'Simplified Chinese' : 'English'
  const source = from.startsWith('zh') ? 'Chinese' : 'English'
  const system =
    `You translate ${source} to ${target} for a bilingual ebook. ` +
    'Return a JSON array of strings, same length and order as the input. No commentary.'
  if (flavor === 'anthropic') {
    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': secrets.aiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: secrets.aiModel,
        max_tokens: 4096,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: JSON.stringify(texts) }],
      }),
    }
  }
  return {
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secrets.aiKey}`,
    },
    body: JSON.stringify({
      model: secrets.aiModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(texts) },
      ],
    }),
  }
}

export function parseAi(payload: unknown, expected: number): string[] {
  const openai = (payload as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content
  const blocks = (payload as { content?: { type?: string; text?: string }[] })?.content
  const anthropic = Array.isArray(blocks)
    ? blocks.map((block) => block.text ?? '').join('')
    : ''
  const content = openai || anthropic
  if (!content) throw new Error('AI 翻译没有返回内容')
  const json = extractJson(content)
  if (!Array.isArray(json)) throw new Error('AI 翻译不是 JSON 数组')
  return pad(json.map((item) => String(item)), expected)
}

export function edgeAuthRequest(): PreparedRequest {
  return { url: `${edgeAuthOrigin()}/translate/auth`, method: 'GET', headers: {} }
}

export function edgeTranslateRequest(
  texts: string[],
  from: string,
  to: string,
  token: string,
): PreparedRequest {
  const params = new URLSearchParams({
    'api-version': '3.0',
    from: microsoftLang(from),
    to: microsoftLang(to),
  })
  return {
    url: `${edgeApiOrigin()}/translate?${params}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(texts.map((text) => ({ Text: text }))),
  }
}

export function missingSecret(engine: EngineId, secrets: TranslatorSecrets): string | null {
  if (engine === 'ai' && !secrets.aiKey) return '请先填写 AI 接口密钥'
  return null
}

function browserProxy(): boolean {
  try {
    return typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)
  } catch {
    return false
  }
}

function googleGtxOrigin(): string {
  return browserProxy() ? '/__gtx' : 'https://translate.googleapis.com'
}

function googlePaOrigin(): string {
  return browserProxy() ? '/__gpa' : 'https://translate-pa.googleapis.com'
}

function edgeAuthOrigin(): string {
  return browserProxy() ? '/__edge-auth' : 'https://edge.microsoft.com'
}

function edgeApiOrigin(): string {
  return browserProxy() ? '/__edge-api' : 'https://api-edge.cognitive.microsofttranslator.com'
}

function pad(rows: string[], expected: number): string[] {
  const next = rows.slice(0, expected)
  while (next.length < expected) next.push('')
  return next
}

function decodeHtml(text: string): string {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function extractJson(content: string): unknown {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : trimmed
  return JSON.parse(raw)
}
