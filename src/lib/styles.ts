import { hostedStack } from './fonts'
import type { FontId, Prefs, Theme, ThemeId } from '../types'

export const THEMES: Theme[] = [
  { id: 'white', name: '白', bg: '#FFFFFF', fg: '#1F1F1F', muted: '#8A8A8A' },
  { id: 'page', name: '素页', bg: '#F9FAFB', fg: '#151617', muted: '#6E7276' },
  { id: 'cream', name: '米白', bg: '#F7F1E3', fg: '#3A3228', muted: '#8A7E70' },
  { id: 'paper', name: '羊皮纸', bg: '#F3E9D7', fg: '#3D3226', muted: '#8A7A68' },
  { id: 'kraft', name: '牛皮纸', bg: '#E4D0A8', fg: '#3A2C1C', muted: '#8A7050' },
  { id: 'gray', name: '素灰', bg: '#E8E6E3', fg: '#2A2A2A', muted: '#7A7A76' },
  { id: 'green', name: '护眼绿', bg: '#CDE7C3', fg: '#2C3B28', muted: '#6A7A66' },
  { id: 'night', name: '夜间', bg: '#1A1A1A', fg: '#A3A3A3', muted: '#6A6A6A', dark: true },
  { id: 'warmNight', name: '暖夜', bg: '#2A231C', fg: '#C9BBA8', muted: '#8A7A68', dark: true },
  { id: 'ink', name: '墨黑', bg: '#121212', fg: '#B8B8B8', muted: '#6E6E6E', dark: true },
  { id: 'dusk', name: '暮蓝', bg: '#1B2330', fg: '#C5CDD8', muted: '#7A8494', dark: true },
]

export const FONTS: { id: FontId; name: string; stack: string }[] = [
  {
    id: 'song',
    name: '思源宋体',
    stack: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, serif',
  },
  {
    id: 'kinghwa',
    name: '京华老宋体',
    stack: hostedStack('kinghwa', '"Noto Serif SC", "Songti SC", serif'),
  },
  {
    id: 'fang',
    name: '仿宋',
    stack: '"STFangsong", "FangSong", "Songti SC", "Noto Serif SC", serif',
  },
  {
    id: 'zhuque',
    name: '朱雀仿宋',
    stack: hostedStack('zhuque', '"STFangsong", "FangSong", "Noto Serif SC", serif'),
  },
  {
    id: 'kai',
    name: '楷体',
    stack: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif',
  },
  {
    id: 'wenkai',
    name: '霞鹜文楷',
    stack: hostedStack('wenkai', '"Kaiti SC", "STKaiti", "Noto Serif SC", serif'),
  },
  {
    id: 'hei',
    name: '思源黑体',
    stack: '"Noto Sans SC", "Source Han Sans SC", "Heiti SC", sans-serif',
  },
  {
    id: 'yuan',
    name: '圆体',
    stack: '"Yuanti SC", "STYuanti", "PingFang SC", sans-serif',
  },
  {
    id: 'pingfang',
    name: '苹方',
    stack: '"PingFang SC", -apple-system, "Hiragino Sans GB", sans-serif',
  },
  {
    id: 'palatino',
    name: 'Palatino',
    stack: '"Palatino", "Palatino Linotype", "Iowan Old Style", Georgia, "Noto Serif SC", serif',
  },
  {
    id: 'newsreader',
    name: 'Newsreader',
    stack: '"Newsreader", "Iowan Old Style", "Palatino", Georgia, serif',
  },
]

export const DEFAULT_PREFS: Prefs = {
  theme: 'paper',
  font: 'song',
  fontSize: 20,
  lineHeight: 1.9,
  flow: 'paginated',
  justify: true,
  parallel: true,
}

export function themeOf(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[1]
}

export function fontStack(id: FontId): string {
  return FONTS.find((f) => f.id === id)?.stack ?? FONTS[0].stack
}

const CJK_FONTS: ReadonlySet<FontId> = new Set([
  'song',
  'kinghwa',
  'fang',
  'zhuque',
  'kai',
  'wenkai',
  'hei',
  'yuan',
  'pingfang',
])

export type TypesetScript = 'zh' | 'en'

export function fontForScript(font: FontId, script: TypesetScript): FontId {
  if (script === 'en' && CJK_FONTS.has(font)) return 'newsreader'
  return font
}

const WARM_PAPER: ReadonlySet<ThemeId> = new Set(['paper', 'cream'])

export function themeForScript(theme: ThemeId, script: TypesetScript): ThemeId {
  if (script === 'en' && WARM_PAPER.has(theme)) return 'page'
  return theme
}

export function bookCSS(prefs: Prefs, script: TypesetScript = 'zh'): string {
  const theme = themeOf(prefs.theme)
  const stack = fontStack(prefs.font)
  const dark = Boolean(theme.dark)
  const type = script === 'en' ? englishType(prefs, stack, theme.fg) : chineseType(prefs, stack, theme.fg)
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      color-scheme: ${dark ? 'dark' : 'light'};
      background: ${theme.bg} !important;
    }
    body {
      color: ${theme.fg} !important;
      background: ${theme.bg} !important;
      font-family: ${stack} !important;
      font-size: ${prefs.fontSize}px !important;
      font-weight: 400;
      letter-spacing: ${script === 'en' ? '0' : '0.02em'};
    }
    ${type}
    a { color: inherit; }
    pre, code {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      text-indent: 0;
    }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
    span.leaf-tr,
    [data-leaf-tr] {
      display: block !important;
      text-indent: 0 !important;
      font-size: 0.92em !important;
      color: ${theme.muted} !important;
      line-height: ${Math.max(prefs.lineHeight - 0.1, 1.5)} !important;
      margin: 0.15em 0 0.55em 0 !important;
      letter-spacing: 0.01em;
    }
  `
}

function chineseType(prefs: Prefs, stack: string, fg: string): string {
  return `
    p, li, blockquote, dd {
      line-height: ${prefs.lineHeight} !important;
      text-align: ${prefs.justify ? 'justify' : 'start'};
      -webkit-hyphens: none;
      hyphens: none;
      text-indent: 2em;
      margin: 0 0 0.28em 0;
      hanging-punctuation: allow-end last;
      widows: 2;
      orphans: 2;
    }
    li { text-indent: 0; }
    h1, h2, h3, h4 {
      font-family: ${stack} !important;
      font-weight: 600;
      text-indent: 0;
      text-align: center;
      line-height: 1.45;
      letter-spacing: 0.08em;
      margin: 1.6em 0 1.1em;
      color: ${fg};
    }
  `
}

function englishType(prefs: Prefs, stack: string, fg: string): string {
  return `
    p, li, blockquote, dd {
      font-family: inherit !important;
      font-size: inherit !important;
      line-height: ${prefs.lineHeight} !important;
      text-align: start !important;
      -webkit-hyphens: auto;
      hyphens: auto;
      hyphenate-limit-chars: 6 3 3;
      text-indent: 0 !important;
      margin: 0 0 1.2em 0 !important;
      widows: 2;
      orphans: 2;
    }
    li { margin-bottom: 0.45em !important; }
    blockquote { margin: 0 0 1.2em 1.1em !important; }
    h1, h2, h3, h4 {
      font-family: ${stack} !important;
      font-weight: 400 !important;
      text-indent: 0 !important;
      text-align: start !important;
      line-height: 1.2;
      letter-spacing: -0.02em !important;
      margin: 1.5em 0 0.7em;
      color: ${fg};
    }
    h1 { font-size: 2.2em; line-height: 1.15; letter-spacing: -0.025em !important; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
  `
}

export function withFontFaces(css: string, fontFaces: string): string {
  return `${fontFaces}\n${css}`
}

export function readerCSS(prefs: Prefs, script: TypesetScript, fontFaces: string): string {
  const adapted = {
    ...prefs,
    font: fontForScript(prefs.font, script),
    theme: themeForScript(prefs.theme, script),
  }
  return withFontFaces(bookCSS(adapted, script), fontFaces)
}
