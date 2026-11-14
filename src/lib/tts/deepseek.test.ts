import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTS } from './config'
import { deepseekRequest, deepseekSpeaker, fetchDeepSeekSpeech, prefetchDeepSeekSpeech } from './deepseek'

const config = {
  ...DEFAULT_TTS,
  provider: 'deepseek' as const,
  deepseekKey: 'ds-key',
  deepseekVoice: 'stella',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deepseekRequest', () => {
  it('builds the speech-tool body: text, voice id, wav, no markdown, no speed', () => {
    const request = deepseekRequest('你好。', { ...config, rate: 1.5 })
    expect(request.url).toBe('https://api.deepseek.com/v1/tools/tts')
    expect(request.headers.Authorization).toBe('Bearer ds-key')
    expect(request.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(request.body)).toEqual({
      text: '你好。',
      voice_id: 'stella',
      format: 'wav',
      filter_markdown: true,
    })
  })

  it('cleans a pasted key and falls back to the default voice', () => {
    const request = deepseekRequest('Hello.', { ...config, deepseekKey: 'Bearer "ds-key"', deepseekVoice: ' ' })
    expect(request.headers.Authorization).toBe('Bearer ds-key')
    expect(JSON.parse(request.body).voice_id).toBe('stella')
  })

  it('keeps the same body across rates, so a speed change does not refetch', () => {
    expect(deepseekRequest('你好。', { ...config, rate: 0.8 }).body).toBe(
      deepseekRequest('你好。', { ...config, rate: 2 }).body,
    )
  })
})

describe('fetchDeepSeekSpeech', () => {
  const okAudio = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/wav' },
    })

  it('posts the sentence and returns the wav bytes', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    const blob = await fetchDeepSeekSpeech('你好。', config)
    expect(blob.size).toBe(3)
    expect(blob.type).toBe('audio/wav')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/tools/tts')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).text).toBe('你好。')
  })

  it('rejects a missing key before any request', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchDeepSeekSpeech('你好。', { ...config, deepseekKey: '' })).rejects.toThrow(/密钥/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns status codes into readable messages', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 401 }))
    await expect(fetchDeepSeekSpeech('你好。', config)).rejects.toThrow('DeepSeek 朗读密钥没有被接受')

    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }))
    await expect(fetchDeepSeekSpeech('你好。', config)).rejects.toThrow('DeepSeek 朗读限流')

    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }))
    await expect(fetchDeepSeekSpeech('你好。', config)).rejects.toThrow('DeepSeek 朗读正忙')

    vi.stubGlobal('fetch', async () => new Response('', { status: 504 }))
    await expect(fetchDeepSeekSpeech('你好。', config)).rejects.toThrow('DeepSeek 朗读超时')
  })

  it('names a content review refusal and shows the API message otherwise', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: { message: 'Content Exists Risk' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    )
    await expect(fetchDeepSeekSpeech('你好。', config)).rejects.toThrow('没有通过 DeepSeek 的内容审核')

    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: { message: 'invalid voice_id' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    )
    await expect(fetchDeepSeekSpeech('你好。', config)).rejects.toThrow('DeepSeek 朗读 400：invalid voice_id')
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
    await expect(fetchDeepSeekSpeech('你好。', config)).rejects.toThrow('DeepSeek 朗读没有返回声音')
  })
})

describe('deepseek prefetch cache', () => {
  const okAudio = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/wav' },
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

  it('warms the cache so a later sentence does not hit the network twice', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    const unit = { blockIndex: 0, text: 'DeepSeek 预热甲句。', start: 0, occurrence: 0 }

    await prefetchDeepSeekSpeech([unit.text], config)
    deepseekSpeaker(config)(unit, { onStart: vi.fn(), onEnd: vi.fn(), onError: vi.fn() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keys the cache on the voice too, so a voice switch refetches', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    await fetchDeepSeekSpeech('同句换音色。', config)
    await fetchDeepSeekSpeech('同句换音色。', { ...config, deepseekVoice: 'tide' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('applies the reader speed on the audio element, since the service cannot', async () => {
    vi.stubGlobal('fetch', async () => okAudio())
    deepseekSpeaker({ ...config, rate: 1.5 })(
      { blockIndex: 0, text: '倍速这一句。', start: 0, occurrence: 0 },
      { onStart: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
    )
    const el = document.querySelector('audio')
    await vi.waitFor(() => expect(el?.playbackRate).toBe(1.5))
  })
})
