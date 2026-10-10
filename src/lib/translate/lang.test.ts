import { describe, expect, it } from 'vitest'
import { detectScript, microsoftLang, resolveDirection, resolveParallel, shouldOpenParallel } from './lang'

describe('detectScript', () => {
  it('detects English', () => {
    expect(detectScript('A personal reader should disappear.')).toBe('en')
  })

  it('detects Chinese', () => {
    expect(detectScript('阅读软件并不缺。缺的是一个安静的地方。')).toBe('zh')
  })

  it('detects mixed when neither script dominates', () => {
    expect(detectScript('AAAAAA 你好世界啊啊 AAAAAA 你好世界啊啊')).toBe('mixed')
  })

  it('returns other for punctuation only', () => {
    expect(detectScript('——……')).toBe('other')
  })

  it('treats empty as other', () => {
    expect(detectScript('')).toBe('other')
  })
})

describe('resolveDirection', () => {
  it('honors explicit en-zh', () => {
    expect(resolveDirection('中文', 'en-zh')).toEqual({ from: 'en', to: 'zh-CN' })
  })

  it('honors explicit zh-en', () => {
    expect(resolveDirection('Hello', 'zh-en')).toEqual({ from: 'zh-CN', to: 'en' })
  })

  it('auto-translates English to Chinese', () => {
    expect(resolveDirection('Turn the page.', 'auto')).toEqual({ from: 'en', to: 'zh-CN' })
  })

  it('auto-translates Chinese to English', () => {
    expect(resolveDirection('左右翻页。', 'auto')).toEqual({ from: 'zh-CN', to: 'en' })
  })
})

describe('shouldOpenParallel', () => {
  it('opens对照 only for fully English books', () => {
    expect(shouldOpenParallel('en')).toBe(true)
    expect(shouldOpenParallel('zh')).toBe(false)
    expect(shouldOpenParallel('mixed')).toBe(false)
    expect(shouldOpenParallel('other')).toBe(false)
    expect(shouldOpenParallel(undefined)).toBe(false)
  })

  it('honors the English default switch', () => {
    expect(shouldOpenParallel('en', false)).toBe(false)
    expect(shouldOpenParallel('zh', true)).toBe(false)
  })
})

describe('resolveParallel', () => {
  it('uses a saved per-book override', () => {
    expect(resolveParallel({ language: 'en', parallel: false }, true)).toBe(false)
    expect(resolveParallel({ language: 'zh', parallel: true }, false)).toBe(true)
  })

  it('defaults English on and Chinese off', () => {
    expect(resolveParallel({ language: 'en' }, true)).toBe(true)
    expect(resolveParallel({ language: 'zh' }, true)).toBe(false)
  })
})

describe('microsoftLang', () => {
  it('maps simplified Chinese to zh-Hans', () => {
    expect(microsoftLang('zh-CN')).toBe('zh-Hans')
  })
})
