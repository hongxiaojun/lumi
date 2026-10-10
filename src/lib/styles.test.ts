import { describe, expect, it } from 'vitest'
import {
  bookCSS,
  DEFAULT_PREFS,
  fontForScript,
  fontStack,
  readerCSS,
  THEMES,
  themeForScript,
  themeOf,
} from './styles'

const zh = bookCSS(DEFAULT_PREFS, 'zh')
const en = bookCSS({ ...DEFAULT_PREFS, font: 'newsreader' }, 'en')

describe('bookCSS profiles', () => {
  it('indents Chinese paragraphs and centers headings', () => {
    expect(zh).toMatch(/text-indent:\s*2em/)
    expect(zh).toMatch(/text-align:\s*center/)
    expect(zh).toMatch(/hyphens:\s*none/)
  })

  it('gives English the Xiaolai article rhythm: no indent, paragraph gap, left headings', () => {
    expect(en).toMatch(/text-indent:\s*0/)
    expect(en).toMatch(/margin:\s*0 0 1\.2em/)
    expect(en).toMatch(/text-align:\s*start/)
    expect(en).toMatch(/letter-spacing:\s*-0\.02em/)
    expect(en).toMatch(/hyphens:\s*auto/)
    expect(en).not.toMatch(/text-indent:\s*2em/)
    expect(en).not.toMatch(/h1,\s*h2,\s*h3,\s*h4 \{[^}]*text-align:\s*center/s)
  })

  it('sets Newsreader as the English body face', () => {
    expect(en).toMatch(/Newsreader/)
    expect(fontStack('newsreader')).toMatch(/Newsreader/)
  })
})

describe('Xiaolai page color', () => {
  it('is a cool off-white, not warm parchment', () => {
    const page = THEMES.find((t) => t.id === 'page')
    expect(page).toMatchObject({ bg: '#F9FAFB', fg: '#151617', muted: '#6E7276' })
    expect(page?.bg).not.toBe('#F3E9D7')
  })

  it('swaps warm paper to 素页 for English, keeps night and Chinese paper', () => {
    expect(themeForScript('paper', 'en')).toBe('page')
    expect(themeForScript('cream', 'en')).toBe('page')
    expect(themeForScript('night', 'en')).toBe('night')
    expect(themeForScript('green', 'en')).toBe('green')
    expect(themeForScript('page', 'en')).toBe('page')
    expect(themeForScript('paper', 'zh')).toBe('paper')
  })

  it('paints English CSS with the Xiaolai page when prefs still say 羊皮纸', () => {
    const css = readerCSS(DEFAULT_PREFS, 'en', '')
    expect(css).toMatch(/#F9FAFB/)
    expect(css).toMatch(/#151617/)
    expect(css).not.toMatch(/#F3E9D7/)
    expect(themeOf('page').bg).toBe('#F9FAFB')
  })
})

describe('fontForScript', () => {
  it('swaps CJK faces for Newsreader when the book is English', () => {
    expect(fontForScript('song', 'en')).toBe('newsreader')
    expect(fontForScript('kai', 'en')).toBe('newsreader')
    expect(fontForScript('hei', 'en')).toBe('newsreader')
    expect(fontForScript('wenkai', 'en')).toBe('newsreader')
    expect(fontForScript('kinghwa', 'en')).toBe('newsreader')
    expect(fontForScript('zhuque', 'en')).toBe('newsreader')
  })

  it('keeps an English face the user already chose', () => {
    expect(fontForScript('palatino', 'en')).toBe('palatino')
    expect(fontForScript('newsreader', 'en')).toBe('newsreader')
  })

  it('does not swap faces for Chinese books', () => {
    expect(fontForScript('song', 'zh')).toBe('song')
    expect(fontForScript('newsreader', 'zh')).toBe('newsreader')
    expect(fontForScript('wenkai', 'zh')).toBe('wenkai')
    expect(fontStack('wenkai')).toContain('霞鹜文楷 GB 屏幕阅读版')
    expect(fontStack('kinghwa')).toContain('京華老宋体')
    expect(fontStack('zhuque')).toContain('朱雀仿宋（预览测试版）')
    expect(fontStack('hei')).toContain('Noto Sans SC')
  })
})
