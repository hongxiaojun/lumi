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

  it('uses an added font itself, so switching it changes the page', () => {
    const first = bookCSS({ ...DEFAULT_PREFS, font: 'user:one' }, 'zh')
    const second = bookCSS({ ...DEFAULT_PREFS, font: 'user:two' }, 'zh')
    expect(first).toMatch(/body\s*\{[^}]*font-family:\s*"leaf-user-one"/s)
    expect(second).toMatch(/body\s*\{[^}]*font-family:\s*"leaf-user-two"/s)
    expect(first).not.toContain('local("leaf-user-one")')
    expect(second).not.toContain('local("leaf-user-two")')
    expect(first).not.toContain('leaf-user-two')
  })

  it('keeps bold on the body face so the spacing stays', () => {
    expect(zh).toMatch(/font-family:\s*"leaf-body", "仓耳今楷02-6763 W04"/)
    expect(zh).toMatch(/@font-face\{font-family:"leaf-body";font-weight:100 900;[^}]*local\("仓耳今楷02-6763 W04"\)/)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*font-family:\s*inherit !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*font-weight:\s*400 !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*line-height:\s*inherit !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*letter-spacing:\s*inherit !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*font-size:\s*inherit !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*font-synthesis:\s*none !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*text-autospace:\s*inherit !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*text-spacing-trim:\s*inherit !important/s)
    expect(zh).toMatch(/b,\s*strong\s*\{[^}]*text-shadow:\s*none !important/s)
    expect(zh).not.toMatch(/b,\s*strong\s*\{[^}]*0\.03em/s)
    expect(zh).not.toMatch(/h1,\s*h2,\s*h3,\s*h4 \{[^}]*font-family:\s*"仓耳今楷/s)
  })

  it('draws Chinese spacing on the page and leaves code and pictures alone', () => {
    expect(zh).toMatch(/text-autospace:\s*normal/)
    expect(zh).toMatch(/text-spacing-trim:\s*space-first/)
    expect(zh).toMatch(/line-break:\s*strict/)
    expect(zh).toMatch(/font-kerning:\s*normal/)
    expect(zh).toMatch(/hanging-punctuation:\s*allow-end last/)
    expect(zh).toMatch(/pre,\s*code\s*\{[^}]*text-autospace:\s*no-autospace/s)
    expect(zh).toMatch(/img\s*\{[^}]*max-inline-size:\s*100%/s)
    expect(zh).toMatch(/img\s*\{[^}]*height:\s*auto/s)
  })

  it('gives English the Xiaolai article rhythm: no indent, paragraph gap, left headings', () => {
    expect(en).toMatch(/text-indent:\s*0/)
    expect(en).toMatch(/margin:\s*0 0 1\.2em/)
    expect(en).toMatch(/text-align:\s*start/)
    expect(en).toMatch(/letter-spacing:\s*-0\.02em/)
    expect(en).toMatch(/hyphens:\s*auto/)
    expect(en).toMatch(/hyphenate-limit-chars:\s*6 3 3/)
    expect(en).toMatch(/hyphenate-limit-lines:\s*2/)
    expect(en).toMatch(/text-autospace:\s*no-autospace/)
    expect(en).toMatch(/font-kerning:\s*normal/)
    expect(en).toMatch(/font-variant-ligatures:\s*common-ligatures contextual/)
    expect(en).not.toMatch(/text-spacing-trim/)
    expect(en).not.toMatch(/line-break:\s*strict/)
    expect(en).not.toMatch(/text-indent:\s*2em/)
    expect(en).not.toMatch(/h1,\s*h2,\s*h3,\s*h4 \{[^}]*text-align:\s*center/s)
  })

  it('sets Newsreader as the English body face', () => {
    expect(en).toMatch(/Newsreader/)
    expect(fontStack('newsreader')).toMatch(/Newsreader/)
  })

  it('gives listening a larger, single-measure layout without changing the paper', () => {
    const listen = bookCSS(DEFAULT_PREFS, 'zh', true)
    expect(listen).toMatch(/max-inline-size:\s*30em/)
    expect(listen).toMatch(/text-indent:\s*0 !important/)
    expect(listen).toMatch(/text-align:\s*start !important/)
    expect(listen).toMatch(/margin:\s*0 auto 0\.95em !important/)
    expect(listen).toContain(THEMES.find((theme) => theme.id === DEFAULT_PREFS.theme)!.bg)
    expect(readerCSS(DEFAULT_PREFS, 'zh', '', true)).toContain('max-inline-size: 30em')
    expect(readerCSS(DEFAULT_PREFS, 'zh', '', false)).not.toContain('max-inline-size: 30em')
  })

  it('takes listening typography from its own params, not the reading font size', () => {
    const listen = bookCSS(DEFAULT_PREFS, 'zh', true, { size: 28, leading: 2.2 })
    expect(listen).toMatch(/font-size:\s*28px !important/)
    expect(listen).toMatch(/line-height:\s*2\.2 !important/)

    // A big reading font size must not leak into the listening layout.
    const reader = bookCSS({ ...DEFAULT_PREFS, fontSize: 32 }, 'zh', true, { size: 26, leading: 2.05 })
    expect(reader).toMatch(/font-size:\s*26px !important/)
    expect(reader).toMatch(/line-height:\s*2\.05 !important/)
    expect(reader).toMatch(/font-size:\s*32px/)
  })

  it('injects a paper-colored wash token for the immersive sentence mask', () => {
    const css = readerCSS(DEFAULT_PREFS, 'zh', '', true)
    expect(css).toMatch(/--leaf-read-wash:\s*rgba\(/)
    const night = readerCSS({ ...DEFAULT_PREFS, theme: 'night' as typeof DEFAULT_PREFS.theme }, 'zh', '', true)
    expect(night).toMatch(/--leaf-read-wash:\s*rgba\(26,\s*26,\s*26,/)
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

  it('ships the read-aloud focus rules into the book page', () => {
    expect(readerCSS(DEFAULT_PREFS, 'zh', '')).toContain('leaf-focus-dim')
    expect(readerCSS(DEFAULT_PREFS, 'en', '')).toContain('prefers-reduced-motion')
  })

  it('injects the read-aloud mark colors as variables the book page can resolve', () => {
    const css = readerCSS(DEFAULT_PREFS, 'zh', '', false, {
      line: 'sentinel-line',
      word: 'sentinel-word',
      blend: 'sentinel-blend',
    })
    expect(css).toContain('--leaf-read-line: sentinel-line')
    expect(css).toContain('--leaf-read-word: sentinel-word')
    expect(css).toContain('--leaf-read-blend: sentinel-blend')
    // No explicit palette resolves the app stylesheet; jsdom has none, but the
    // declarations must still be there so the iframe contract stays intact.
    const fallback = readerCSS(DEFAULT_PREFS, 'zh', '')
    expect(fallback).toContain('--leaf-read-line:')
    expect(fallback).toContain('--leaf-read-word:')
  })

  it('swaps the read-aloud marks to the dark-paper screen blend on night papers', () => {
    const css = readerCSS({ ...DEFAULT_PREFS, theme: 'night' }, 'zh', '')
    expect(css).toContain('--leaf-read-blend: screen')
    expect(css).toContain('--leaf-read-line: #5A4A00')
    expect(css).toContain('--leaf-read-word: #6E3A00')
    const warm = readerCSS({ ...DEFAULT_PREFS, theme: 'warmNight' }, 'zh', '')
    expect(warm).toContain('--leaf-read-blend: screen')
    // Light papers keep the marker multiply from the app catalog.
    const light = readerCSS(DEFAULT_PREFS, 'zh', '')
    expect(light).toContain('--leaf-read-blend: multiply')
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

  it('defaults Chinese books to the installed 仓耳今楷 and keeps the file out of the app', () => {
    expect(DEFAULT_PREFS.font).toBe('localkai')
    const stack = fontStack('localkai')
    expect(stack.startsWith('"仓耳今楷02-6763 W04"')).toBe(true)
    expect(stack).toContain('"仓耳今楷02-6763 W01"')
    expect(stack).toContain('"仓耳今楷04-6763 W03"')
    expect(stack).toContain('"仓耳今楷04-6763 W02"')
    expect(stack).toContain('"仓耳今楷04-6763 W01"')
    expect(stack).toContain('"Kaiti SC"')
    expect(stack).not.toMatch(/url\(|mianfeiziti/)
    expect(fontForScript('localkai', 'zh')).toBe('localkai')
    expect(fontForScript('localkai', 'en')).toBe('newsreader')
    expect(bookCSS({ ...DEFAULT_PREFS, font: 'localkai' }, 'zh')).toContain('仓耳今楷02-6763 W04')
  })
})
