import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTS } from './config'
import { azureEndpoint, azureSsml, azureSpeaker, escapeXml, fetchAzureSpeech, prefetchAzureSpeech } from './azure'

const config = {
  ...DEFAULT_TTS,
  provider: 'azure' as const,
  azureRegion: 'eastasia',
  azureKey: 'azure-key',
  azureVoice: 'zh-CN-XiaoxiaoNeural',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('azureEndpoint', () => {
  it('builds the regional endpoint from a bare region name', () => {
    expect(azureEndpoint('eastasia')).toBe('https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1')
    expect(azureEndpoint(' EastUS2 ')).toBe('https://eastus2.tts.speech.microsoft.com/cognitiveservices/v1')
  })

  it('accepts a full host or endpoint and never appends the path twice', () => {
    expect(azureEndpoint('https://myres.cognitiveservices.azure.com')).toBe(
      'https://myres.cognitiveservices.azure.com/cognitiveservices/v1',
    )
    expect(azureEndpoint('https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1')).toBe(
      'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1',
    )
    expect(azureEndpoint('https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1/')).toBe(
      'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1',
    )
  })

  it('falls back to the default region when blank', () => {
    expect(azureEndpoint('')).toBe(azureEndpoint(DEFAULT_TTS.azureRegion))
  })
})

describe('escapeXml', () => {
  it('escapes the five XML specials without touching CJK', () => {
    expect(escapeXml(`a<b&"c"'d&更`)).toBe('a&lt;b&amp;&quot;c&quot;&apos;d&amp;更')
    expect(escapeXml('纯中文句子。')).toBe('纯中文句子。')
  })

  it('escapes the ampersand first, so entities are not double-escaped', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;')
  })
})

describe('azureSsml', () => {
  it('wraps the sentence in a speak element with voice and prosody rate', () => {
    expect(azureSsml('你好。', { ...config, rate: 1.2 })).toBe(
      "<speak version='1.0' xml:lang='zh-CN'><voice name='zh-CN-XiaoxiaoNeural' xml:lang='zh-CN'>" +
        "<prosody rate='+20%'>你好。</prosody></voice></speak>",
    )
  })

  it('maps slow rates to negative percentages and normal speed to zero', () => {
    expect(azureSsml('你好。', { ...config, rate: 0.6 })).toContain("rate='-40%'")
    expect(azureSsml('你好。', { ...config, rate: 2 })).toContain("rate='+100%'")
    expect(azureSsml('你好。', { ...config, rate: 1 })).toContain("rate='+0%'")
  })

  it('derives the language from the voice name and escapes the sentence', () => {
    const ssml = azureSsml('Tom & Jerry <live> here', {
      ...config,
      azureVoice: 'en-US-JennyNeural',
      rate: 1,
    })
    expect(ssml).toContain("xml:lang='en-US'")
    expect(ssml).toContain('Tom &amp; Jerry &lt;live&gt; here')
  })

  it('falls back to zh-CN when the voice name has no locale prefix', () => {
    const ssml = azureSsml('你好。', { ...config, azureVoice: 'my-custom-voice' })
    expect(ssml).toContain("xml:lang='zh-CN'")
  })
})

describe('fetchAzureSpeech', () => {
  const okAudio = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })

  it('posts ssml with the Azure headers and returns the audio bytes', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    const blob = await fetchAzureSpeech('你好。', config)
    expect(blob.size).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('azure-key')
    expect(init.headers['Content-Type']).toBe('application/ssml+xml')
    expect(init.headers['X-Microsoft-OutputFormat']).toBe('audio-24khz-48kbitrate-mono-mp3')
    expect(String(init.headers['User-Agent'])).toBeTruthy()
    expect(String(init.body)).toContain('<speak')
  })

  it('rejects a missing key or region before any request', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchAzureSpeech('你好。', { ...config, azureKey: '' })).rejects.toThrow(/密钥/)
    await expect(fetchAzureSpeech('你好。', { ...config, azureRegion: '' })).rejects.toThrow(/区域/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns status codes into readable messages', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 401 }))
    await expect(fetchAzureSpeech('你好。', config)).rejects.toThrow('Azure 朗读密钥没有被接受')

    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }))
    await expect(fetchAzureSpeech('你好。', config)).rejects.toThrow('Azure 朗读限流')

    vi.stubGlobal('fetch', async () => new Response('bad gateway', { status: 502 }))
    await expect(fetchAzureSpeech('你好。', config)).rejects.toThrow('Azure 朗读 502')
  })

  it('rejects a JSON body that carries no audio', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: 'nope' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    await expect(fetchAzureSpeech('你好。', config)).rejects.toThrow('Azure 朗读没有返回声音')
  })
})

describe('azure prefetch cache', () => {
  const okAudio = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    ;(URL as { createObjectURL?: unknown }).createObjectURL = () => 'blob:stub'
    ;(URL as { revokeObjectURL?: unknown }).revokeObjectURL = () => {}
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (URL as { createObjectURL?: unknown }).createObjectURL
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL
  })

  it('warms the azure cache so a later sentence does not hit the network twice', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    const unit = (text: string) => ({ blockIndex: 0, text, start: 0, occurrence: 0 })
    const handlers = () => ({ onStart: vi.fn(), onEnd: vi.fn(), onError: vi.fn() })

    prefetchAzureSpeech(['跨章甲句。', '跨章乙句。'], config)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    // The next chapter's player plays sentence one from the warm cache.
    azureSpeaker(config)(unit('跨章甲句。'), handlers())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keys the cache on the endpoint too, so a region switch refetches', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)

    await fetchAzureSpeech('同句跨区域。', config)
    await fetchAzureSpeech('同句跨区域。', { ...config, azureRegion: 'japaneast' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
