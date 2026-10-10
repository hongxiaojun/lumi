import { describe, expect, it } from 'vitest'
import {
  aiRequest,
  edgeAuthRequest,
  edgeTranslateRequest,
  googleGtxRequest,
  googlePaRequest,
  googleRequest,
  missingSecret,
  parseAi,
  parseGoogle,
  parseGooglePa,
  parseMicrosoft,
  microsoftRequest,
  DEFAULT_SECRETS,
} from './engines'

describe('googleRequest', () => {
  it('uses the official API when a key is present', () => {
    const req = googleRequest(['Hello'], 'en', 'zh-CN', 'abc')
    expect(req.url).toContain('translation.googleapis.com/language/translate/v2')
    expect(req.method).toBe('POST')
    expect(JSON.parse(req.body ?? '{}')).toMatchObject({ q: ['Hello'], target: 'zh-CN' })
  })

  it('builds the free translate-pa request', () => {
    const req = googlePaRequest(['Hello'], 'en', 'zh-CN')
    expect(req.url).toContain('/v1/translate')
    expect(req.url).toContain('query.text=Hello')
    expect(req.method).toBe('GET')
  })

  it('builds the gtx fallback request', () => {
    const req = googleGtxRequest(['Hello'], 'en', 'zh-CN')
    expect(req.url).toContain('client=gtx')
    expect(req.method).toBe('GET')
  })
})

describe('parseGoogle', () => {
  it('parses official v2 payload', () => {
    expect(
      parseGoogle({ data: { translations: [{ translatedText: '你好' }] } }, 1),
    ).toEqual(['你好'])
  })

  it('parses gtx nested arrays and splits lines', () => {
    expect(parseGoogle([[['你好\n世界', 'Hello\nWorld']]], 2)).toEqual(['你好', '世界'])
  })

  it('parses translate-pa payload', () => {
    expect(parseGooglePa({ translation: '你好\n世界' }, 2)).toEqual(['你好', '世界'])
  })
})

describe('microsoftRequest', () => {
  it('sends the Azure headers and zh-Hans target', () => {
    const req = microsoftRequest(['Hello'], 'en', 'zh-CN', 'k', 'eastasia')
    expect(req.url).toContain('api.cognitive.microsofttranslator.com/translate')
    expect(req.url).toContain('to=zh-Hans')
    expect(req.headers['Ocp-Apim-Subscription-Key']).toBe('k')
    expect(JSON.parse(req.body ?? '[]')).toEqual([{ Text: 'Hello' }])
  })
})

describe('parseMicrosoft', () => {
  it('reads the first translation of each item', () => {
    expect(
      parseMicrosoft([{ translations: [{ text: '你好' }] }], 1),
    ).toEqual(['你好'])
  })
})

describe('aiRequest + parseAi', () => {
  it('posts a JSON-array instruction to an OpenAI-compatible endpoint', () => {
    const req = aiRequest(['Hello'], 'en', 'zh-CN', {
      ...DEFAULT_SECRETS,
      aiBaseUrl: 'https://api.deepseek.com/v1',
      aiKey: 'sk',
      aiModel: 'deepseek-chat',
    })
    expect(req.url).toBe('https://api.deepseek.com/v1/chat/completions')
    const body = JSON.parse(req.body ?? '{}') as { messages: { content: string }[] }
    expect(body.messages[0].content).toContain('Simplified Chinese')
    expect(body.messages[1].content).toBe('["Hello"]')
  })

  it('does not double-append chat/completions', () => {
    const req = aiRequest(['Hello'], 'en', 'zh-CN', {
      ...DEFAULT_SECRETS,
      aiBaseUrl: 'https://api.deepseek.com/v1/chat/completions',
      aiKey: 'sk',
      aiModel: 'deepseek-flash',
    })
    expect(req.url).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('uses Anthropic /v1/messages when the base URL is the DeepSeek Anthropic gateway', () => {
    const req = aiRequest(['Hello'], 'en', 'zh-CN', {
      ...DEFAULT_SECRETS,
      aiBaseUrl: 'https://api.deepseek.com/anthropic',
      aiKey: 'sk',
      aiModel: 'deepseek-flash',
    })
    expect(req.url).toBe('https://api.deepseek.com/anthropic/v1/messages')
    expect(req.headers['x-api-key']).toBe('sk')
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(req.body ?? '{}') as { max_tokens: number; system: string; messages: unknown[] }
    expect(body.max_tokens).toBeGreaterThan(0)
    expect(body.system).toContain('Simplified Chinese')
    expect(body.messages).toHaveLength(1)
  })

  it('parses fenced JSON from the model', () => {
    expect(
      parseAi({ choices: [{ message: { content: '```json\n["你好"]\n```' } }] }, 1),
    ).toEqual(['你好'])
  })

  it('parses Anthropic content blocks', () => {
    expect(
      parseAi({ content: [{ type: 'text', text: '["你好"]' }] }, 1),
    ).toEqual(['你好'])
  })
})

describe('edge free translator', () => {
  it('asks Edge for a guest token', () => {
    expect(edgeAuthRequest().url).toContain('/translate/auth')
  })

  it('posts Azure-shaped text with the bearer token', () => {
    const req = edgeTranslateRequest(['Hello'], 'en', 'zh-CN', 'tok')
    expect(req.url).toContain('/translate')
    expect(req.url).toContain('to=zh-Hans')
    expect(req.headers.Authorization).toBe('Bearer tok')
  })
})

describe('missingSecret', () => {
  it('allows google and microsoft without a paid key', () => {
    expect(missingSecret('google', DEFAULT_SECRETS)).toBeNull()
    expect(missingSecret('microsoft', DEFAULT_SECRETS)).toBeNull()
  })

  it('requires an AI key', () => {
    expect(missingSecret('ai', DEFAULT_SECRETS)).toMatch(/AI/)
  })
})
