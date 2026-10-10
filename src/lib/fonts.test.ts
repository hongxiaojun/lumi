import { describe, expect, it } from 'vitest'
import { hostedFontFaces, hostedStack } from './fonts'

const origin = 'http://127.0.0.1:5173/'

describe('hosted reading fonts', () => {
  const css = hostedFontFaces(origin)

  it('points the book at the unmodified files with absolute urls', () => {
    expect(css).toContain('http://127.0.0.1:5173/fonts/LXGWWenKaiGBScreen.ttf')
    expect(css).toContain(
      'http://127.0.0.1:5173/fonts/%E4%BA%AC%E8%8F%AF%E8%80%81%E5%AE%8B%E4%BD%93v2.002.ttf',
    )
    expect(css).toContain('http://127.0.0.1:5173/fonts/ZhuqueFangsong-Regular.ttf')
    expect(css).toContain('format("truetype")')
    expect(css).not.toContain('base64')
  })

  it('uses each file’s own family name so an installed copy is preferred', () => {
    expect(css).toContain('font-family:"霞鹜文楷 GB 屏幕阅读版"')
    expect(css).toContain('local("LXGW WenKai GB Screen")')
    expect(css).toContain('font-family:"京華老宋体"')
    expect(css).toContain('local("KingHwa_OldSong")')
    expect(css).toContain('font-family:"朱雀仿宋（预览测试版）"')
    expect(css).toContain('local("Zhuque Fangsong (technical preview)")')
  })

  it('builds a stack that falls back when the file is still loading', () => {
    expect(hostedStack('wenkai', '"Kaiti SC", serif')).toBe(
      '"霞鹜文楷 GB 屏幕阅读版", "LXGW WenKai GB Screen", "Kaiti SC", serif',
    )
    expect(hostedStack('kinghwa', '"Noto Serif SC", serif')).toContain('京華老宋体')
    expect(hostedStack('song', '"Noto Serif SC", serif')).toBe('"Noto Serif SC", serif')
  })
})
