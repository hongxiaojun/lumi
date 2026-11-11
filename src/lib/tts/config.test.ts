import { describe, expect, it } from 'vitest'
import { clampRate, cleanSecret, DEFAULT_TTS, mergeTts, nextRate, normalizeTts, pickVoice, rateChoices, rateLabel } from './config'

describe('normalizeTts', () => {
  it('falls back to defaults and clamps out-of-range values', () => {
    expect(normalizeTts(null)).toEqual(DEFAULT_TTS)
    const config = normalizeTts({ provider: 'cloud', rate: 9, listenLayout: false })
    expect(config.provider).toBe('cloud')
    expect(config.rate).toBe(2)
    expect(config.listenLayout).toBe(false)
    expect(config.cloudBaseUrl).toBe(DEFAULT_TTS.cloudBaseUrl)
  })

  it('keeps an empty key but replaces blank endpoints and voices', () => {
    const config = normalizeTts({
      cloudBaseUrl: '  ',
      cloudModel: ' ',
      cloudVoice: '',
      cloudKey: '',
    })
    expect(config.cloudBaseUrl).toBe(DEFAULT_TTS.cloudBaseUrl)
    expect(config.cloudModel).toBe(DEFAULT_TTS.cloudModel)
    expect(config.cloudVoice).toBe(DEFAULT_TTS.cloudVoice)
    expect(config.cloudKey).toBe('')
    expect(normalizeTts({ listenLayout: undefined }).listenLayout).toBe(true)
  })

  it('accepts the azure provider and keeps azure fields', () => {
    const config = normalizeTts({
      provider: 'azure',
      azureRegion: ' eastasia ',
      azureKey: 'azure-key',
      azureVoice: '',
    })
    expect(config.provider).toBe('azure')
    expect(config.azureRegion).toBe('eastasia')
    expect(config.azureKey).toBe('azure-key')
    expect(config.azureVoice).toBe(DEFAULT_TTS.azureVoice)

    // A stored unknown provider falls back to system, not azure.
    expect(normalizeTts({ provider: 'nope' as 'system' }).provider).toBe('system')
  })

  it('keeps listening typography independent of the reading prefs', () => {
    const config = normalizeTts({ listenFontSize: 999, listenLineHeight: 0.5, immersive: false })
    expect(config.listenFontSize).toBe(34)
    expect(config.listenLineHeight).toBe(1.6)
    expect(config.immersive).toBe(false)

    const defaults = normalizeTts({ listenFontSize: undefined, listenLineHeight: Number.NaN })
    expect(defaults.listenFontSize).toBe(DEFAULT_TTS.listenFontSize)
    expect(defaults.listenLineHeight).toBe(DEFAULT_TTS.listenLineHeight)
    expect(defaults.immersive).toBe(true)
  })
})

describe('cleanSecret', () => {
  it('drops a Bearer prefix, wrapping quotes, and invisible spaces', () => {
    expect(cleanSecret('  Bearer "sk-abc"  ')).toBe('sk-abc')
    expect(cleanSecret("bearer\nsk-ab\u200Bc")).toBe('sk-abc')
    expect(cleanSecret('')).toBe('')
    expect(cleanSecret('sk-keep-hyphen')).toBe('sk-keep-hyphen')
  })
})

describe('mergeTts', () => {
  it('keeps the key when a later edit only changes the voice', () => {
    const withKey = mergeTts(DEFAULT_TTS, { cloudKey: ' Bearer sk-real ', provider: 'cloud' })
    const next = mergeTts(withKey, { cloudVoice: 'FunAudioLLM/CosyVoice2-0.5B:anna' })
    expect(next.cloudKey).toBe('sk-real')
    expect(next.cloudVoice).toBe('FunAudioLLM/CosyVoice2-0.5B:anna')
    expect(next.provider).toBe('cloud')
  })
})

describe('rate helpers', () => {
  it('clamps and rounds to two decimals', () => {
    expect(clampRate(0.1)).toBe(0.6)
    expect(clampRate(3)).toBe(2)
    expect(clampRate(Number.NaN)).toBe(1)
    expect(clampRate(1.234)).toBe(1.23)
  })

  it('cycles through the quick steps and wraps', () => {
    expect(nextRate(1)).toBe(1.25)
    expect(nextRate(1.25)).toBe(1.5)
    expect(nextRate(1.5)).toBe(2)
    expect(nextRate(2)).toBe(0.8)
    expect(rateLabel(1)).toBe('1.0×')
    expect(rateLabel(1.25)).toBe('1.25×')
    expect(rateLabel(2)).toBe('2.0×')
  })

  it('offers 1.25 and 2 as choices and keeps a saved rate that is not in the list', () => {
    expect(rateChoices(1.25)).toEqual([0.8, 1, 1.25, 1.5, 2])
    expect(rateChoices(1.2)).toEqual([0.8, 1, 1.2, 1.25, 1.5, 2])
  })
})

describe('pickVoice', () => {
  const voices = [
    { id: 'en-a', lang: 'en-US' },
    { id: 'zh-a', lang: 'zh-CN' },
    { id: 'zh-b', lang: 'zh-TW' },
  ]

  it('uses the saved voice when it still exists', () => {
    expect(pickVoice(voices, 'zh-b', 'zh-CN')?.id).toBe('zh-b')
  })

  it('falls back to the book language, then to the first voice', () => {
    expect(pickVoice(voices, 'gone', 'zh-CN')?.id).toBe('zh-a')
    expect(pickVoice(voices, '', 'fr-FR')?.id).toBe('en-a')
    expect(pickVoice([], '', 'zh-CN')).toBeNull()
  })
})
