import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTS } from './config'
import {
  cloudVoicePresets,
  filterTtsModels,
  listAzureVoices,
  listCloudModels,
  modelsEndpoint,
  type AzureVoiceOption,
  type CloudVoicePreset,
} from './catalog'

const cloudConfig = {
  ...DEFAULT_TTS,
  provider: 'cloud' as const,
  cloudBaseUrl: 'https://api.siliconflow.cn/v1',
  cloudKey: 'sk-test',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('filterTtsModels', () => {
  const all = [
    'Qwen/Qwen2.5-7B-Instruct',
    'deepseek-ai/DeepSeek-V3',
    'FunAudioLLM/CosyVoice2-0.5B',
    'fnlp/MOSS-TTSD-v0.5',
    'fishaudio/fish-speech-1.5',
    'BAAI/bge-m3',
  ]

  it('keeps only speech-looking models', () => {
    expect(filterTtsModels(all)).toEqual([
      'FunAudioLLM/CosyVoice2-0.5B',
      'fnlp/MOSS-TTSD-v0.5',
      'fishaudio/fish-speech-1.5',
    ])
  })

  it('matches case-insensitively', () => {
    expect(filterTtsModels(['vendor/TTS-Model-X'])).toEqual(['vendor/TTS-Model-X'])
  })

  it('returns everything when nothing looks like speech, so the menu is never empty', () => {
    expect(filterTtsModels(['Qwen/Qwen2.5-7B-Instruct'])).toEqual(['Qwen/Qwen2.5-7B-Instruct'])
    expect(filterTtsModels([])).toEqual([])
  })
})

describe('cloudVoicePresets', () => {
  it('offers the SiliconFlow CosyVoice presets with the model prefix baked in', () => {
    const presets = cloudVoicePresets('https://api.siliconflow.cn/v1', 'FunAudioLLM/CosyVoice2-0.5B')
    expect(presets?.length).toBe(8)
    const alex = presets?.find((p: CloudVoicePreset) => p.id === 'FunAudioLLM/CosyVoice2-0.5B:alex')
    expect(alex?.label).toContain('沉稳')
  })

  it('offers OpenAI voices on the official endpoint', () => {
    const presets = cloudVoicePresets('https://api.openai.com/v1', 'gpt-4o-mini-tts')
    expect(presets?.map((p: CloudVoicePreset) => p.id)).toContain('alloy')
    expect(presets?.map((p: CloudVoicePreset) => p.id)).toContain('cherry')
  })

  it('returns null for unknown services, so the field stays free-form', () => {
    expect(cloudVoicePresets('https://tts.example.com/v1', 'some-model')).toBeNull()
  })
})

describe('modelsEndpoint', () => {
  it('inserts /v1 when the address stops at the host', () => {
    expect(modelsEndpoint('https://api.siliconflow.cn/v1')).toBe('https://api.siliconflow.cn/v1/models')
    expect(modelsEndpoint('https://api.siliconflow.cn/')).toBe('https://api.siliconflow.cn/v1/models')
    expect(modelsEndpoint('https://api.siliconflow.cn/v1/models')).toBe('https://api.siliconflow.cn/v1/models')
  })
})

describe('listCloudModels', () => {
  it('fetches and parses the model ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: [{ id: 'Qwen/Qwen2.5-7B-Instruct' }, { id: 'FunAudioLLM/CosyVoice2-0.5B' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    const models = await listCloudModels(cloudConfig)
    expect(models).toEqual(['FunAudioLLM/CosyVoice2-0.5B'])
  })

  it('rejects with a readable message on auth failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(listCloudModels(cloudConfig)).rejects.toThrow('密钥没有被接受')
  })

  it('keeps the service message when the key is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Token is invalid.' }), { status: 401 })),
    )
    await expect(listCloudModels(cloudConfig)).rejects.toThrow('密钥没有被接受：Token is invalid.')
  })

  it('rejects before any request when the key is blank', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(listCloudModels({ ...cloudConfig, cloudKey: '' })).rejects.toThrow('密钥')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tolerates a body without the data array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(listCloudModels(cloudConfig)).rejects.toThrow('模型列表')
  })
})

describe('listAzureVoices', () => {
  const azureConfig = {
    ...cloudConfig,
    provider: 'azure' as const,
    azureKey: 'azure-key',
  }
  it('fetches the voice list, sorted Chinese locales first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            { ShortName: 'en-US-JennyNeural', DisplayName: 'Jenny', Locale: 'en-US', Gender: 'Female' },
            { ShortName: 'zh-CN-YunxiNeural', DisplayName: '云希', Locale: 'zh-CN', Gender: 'Male' },
            { ShortName: 'zh-CN-XiaoxiaoNeural', DisplayName: '晓晓', Locale: 'zh-CN', Gender: 'Female' },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    const voices = await listAzureVoices(azureConfig)
    expect(voices.map((v: AzureVoiceOption) => v.id)).toEqual([
      'zh-CN-XiaoxiaoNeural',
      'zh-CN-YunxiNeural',
      'en-US-JennyNeural',
    ])
    expect(voices[0].label).toContain('晓晓')
    expect(voices[0].label).toContain('zh-CN')
  })

  it('rejects with a readable message on auth failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(listAzureVoices(azureConfig)).rejects.toThrow('密钥')
  })

  it('rejects before any request when the key or region is blank', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(listAzureVoices({ ...cloudConfig, provider: 'azure', azureKey: '' })).rejects.toThrow('密钥')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
