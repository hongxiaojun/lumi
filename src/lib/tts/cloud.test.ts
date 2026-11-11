import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTS } from './config'
import { cloudSpeaker, fetchSpeech, prefetchSpeech, speechEndpoint, speechRequest } from './cloud'

const config = {
  ...DEFAULT_TTS,
  cloudBaseUrl: 'https://example.test/v1',
  cloudKey: 'secret',
  cloudModel: 'model-a',
  cloudVoice: 'voice-a',
  cloudInstructions: '读得自然一点',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('speechEndpoint', () => {
  it('adds the speech path to an API root', () => {
    expect(speechEndpoint('https://api.example.com/v1')).toBe('https://api.example.com/v1/audio/speech')
    expect(speechEndpoint('https://api.example.com/v1/')).toBe('https://api.example.com/v1/audio/speech')
    expect(speechEndpoint('https://api.example.com')).toBe('https://api.example.com/v1/audio/speech')
    expect(speechEndpoint('https://api.example.com/openai/audio/speech')).toBe(
      'https://api.example.com/openai/audio/speech',
    )
  })
})

describe('speechRequest', () => {
  it('builds an OpenAI-compatible speech body with instructions and speed', () => {
    const request = speechRequest('你好。', { ...config, rate: 1.25 })
    expect(request.url).toBe('https://example.test/v1/audio/speech')
    expect(request.headers.Authorization).toBe('Bearer secret')
    expect(JSON.parse(request.body)).toEqual({
      model: 'model-a',
      input: '你好。',
      voice: 'voice-a',
      response_format: 'mp3',
      speed: 1.25,
      instructions: '读得自然一点',
    })
  })

  it('puts SiliconFlow tone in front of the sentence and cleans the key', () => {
    const request = speechRequest('你好。', {
      ...config,
      cloudBaseUrl: 'https://api.siliconflow.cn/v1',
      cloudKey: 'Bearer sk-real',
      cloudModel: 'FunAudioLLM/CosyVoice2-0.5B',
      cloudVoice: 'FunAudioLLM/CosyVoice2-0.5B:anna',
      cloudInstructions: '用高兴的语气',
    })
    const body = JSON.parse(request.body) as { input: string; instructions?: string }
    expect(request.headers.Authorization).toBe('Bearer sk-real')
    expect(body.input).toBe('用高兴的语气<|endofprompt|>你好。')
    expect(body.instructions).toBeUndefined()
  })

  it('omits blank instructions and clamps speed', () => {
    const request = speechRequest('Hello.', { ...config, rate: 12, cloudInstructions: '  ' })
    const body = JSON.parse(request.body)
    expect(body.speed).toBe(2)
    expect(body.instructions).toBeUndefined()
  })
})

describe('fetchSpeech', () => {
  it('returns the audio bytes and rejects a missing key before any request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const blob = await fetchSpeech('Hello.', config)
    expect(blob.size).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(fetchSpeech('Hello.', { ...config, cloudKey: '' })).rejects.toThrow(/密钥/)
  })

  it('turns a JSON error into a readable message', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ error: 'bad key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(fetchSpeech('Hello.', config)).rejects.toThrow('云端朗读密钥没有被接受')
  })

  it('keeps the underlying reason when the request cannot be sent', async () => {
    vi.stubGlobal('fetch', async () => {
      throw 'Load failed'
    })
    await expect(fetchSpeech('Hello.', config)).rejects.toThrow('云端朗读请求没有发出去：Load failed')
  })
})

describe('cloudSpeaker prefetch', () => {
  const okAudio = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })
  const unit = (text: string) => ({ blockIndex: 0, text, start: 0, occurrence: 0 })
  const handlers = () => ({
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onError: vi.fn(),
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

  it('fetches the upcoming sentences while the current one plays, so the next starts from cache', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    const a = unit('预取甲句。')
    const b = unit('预取乙句。')
    const c = unit('预取丙句。')

    cloudSpeaker(config)(a, handlers(), [b, c])
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    // A fresh speaker per sentence is how useReadAloud calls it; the cache is
    // module-level, so the already fetched sentence must not hit the network.
    cloudSpeaker(config)(b, handlers())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('refetches a sentence whose prefetch failed instead of replaying the rejection', async () => {
    let refetched = false
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const text = JSON.parse(String(init?.body)).input as string
      if (text === '重试乙句。' && !refetched) {
        refetched = true
        throw new Error('限流')
      }
      if (text === '保底丙句。') throw new Error('超时')
      return okAudio()
    })
    vi.stubGlobal('fetch', fetchMock)
    const a = unit('重试甲句。')
    const b = unit('重试乙句。')
    const c = unit('保底丙句。')

    cloudSpeaker(config)(a, handlers(), [b])
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // Let the rejection drop the poisoned cache entry before advancing.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Advancing to b must speak to the network again, not replay the rejection.
    cloudSpeaker(config)(b, handlers())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    // A sentence that fails at playback time still surfaces a readable error.
    const failed = handlers()
    cloudSpeaker(config)(c, failed)
    await vi.waitFor(() => expect(failed.onError).toHaveBeenCalledTimes(1))
    expect(failed.onError.mock.calls[0][0].message).toContain('超时')
  })

  it('refetches when the speed or voice changed, even for the same sentence', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    const text = unit('变速同句。')
    cloudSpeaker({ ...config, rate: 1 })(text, handlers())
    cloudSpeaker({ ...config, rate: 1.5 })(text, handlers())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})

describe('prefetchSpeech (cross-chapter)', () => {
  const okAudio = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })
  const unit = (text: string) => ({ blockIndex: 0, text, start: 0, occurrence: 0 })
  const handlers = () => ({
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onError: vi.fn(),
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

  it('puts the first sentences of the next chapter in the cache so the chapter turn plays at once', async () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)

    prefetchSpeech(['跨章甲句。', '跨章乙句。'], config)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    // The next chapter's player plays sentence one from the warm cache.
    cloudSpeaker(config)(unit('跨章甲句。'), handlers())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('swallows failures without poisoning the retry', async () => {
    let refetched = false
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const text = JSON.parse(String(init?.body)).input as string
      if (text === '失败跨章句。' && !refetched) {
        refetched = true
        throw new Error('限流')
      }
      return okAudio()
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(prefetchSpeech(['失败跨章句。'], config)).resolves.toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Playback after a failed prefetch speaks to the network again.
    cloudSpeaker(config)(unit('失败跨章句。'), handlers())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('seeks inside a loaded clip and reports where it is', async () => {
    let time = 1
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(12)
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => time)
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set').mockImplementation((value) => {
      time = Number(value)
    })
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    const handle = cloudSpeaker(config)(unit('定位这一句。'), handlers())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(handle.position?.()).toEqual({ current: 1, duration: 12 })
    expect(handle.seekTo?.(6)).toBe(true)
    expect(time).toBe(6)
  })

  it('ignores an empty list', () => {
    const fetchMock = vi.fn(async () => okAudio())
    vi.stubGlobal('fetch', fetchMock)
    prefetchSpeech([], config)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
