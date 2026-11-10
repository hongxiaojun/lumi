import { hostedStack } from './fonts'
import { readFocusCSS } from './readFocus'
import { isUserFontId, userFontStack } from './userFonts'
import type { BuiltinFontId, FontId, Prefs, Theme, ThemeId } from '../types'

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

export const FONTS: { id: BuiltinFontId; name: string; stack: string }[] = [
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
    id: 'localkai',
    name: '仓耳今楷',
    stack: [
      '"仓耳今楷02-6763 W04"',
      '"仓耳今楷02-6763 W01"',
      '"仓耳今楷04-6763 W03"',
      '"仓耳今楷04-6763 W02"',
      '"仓耳今楷04-6763 W01"',
      '"TsangerJinKai02-6763 W04"',
      '"Kaiti SC"',
      '"STKaiti"',
      '"KaiTi"',
      'serif',
    ].join(', '),
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
  font: 'localkai',
  fontSize: 20,
  lineHeight: 1.9,
  flow: 'paginated',
  justify: true,
  parallel: true,
  focusRead: false,
}

export function themeOf(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[1]
}

export function fontStack(id: FontId): string {
  if (isUserFontId(id)) return userFontStack(id)
  return FONTS.find((f) => f.id === id)?.stack ?? FONTS[0].stack
}

/** One face for every weight. A bold request otherwise walks the stack and
 *  picks a different cut, so the advances and punctuation no longer match. */
export function pinnedBodyFace(stack: string): { family: string; css: string } {
  const names = [...stack.matchAll(/"([^"]+)"/g)].map((match) => match[1])
  // An added font is an @font-face in the book, not a face installed on the Mac.
  // local() cannot see it, so pinning that name falls through to Songti and
  // every added face looks the same.
  if (names.some((name) => name.startsWith('leaf-user-'))) return { family: stack, css: '' }
  const locals = names.map((name) => `local("${name}")`)
  if (locals.length === 0) return { family: stack, css: '' }
  const css = `@font-face{font-family:"leaf-body";font-weight:100 900;font-style:normal;font-display:swap;src:${locals.join(',')};}`
  return { family: `"leaf-body", ${stack}`, css }
}

const CJK_FONTS: ReadonlySet<BuiltinFontId> = new Set([
  'song',
  'kinghwa',
  'fang',
  'zhuque',
  'kai',
  'localkai',
  'wenkai',
  'hei',
  'yuan',
  'pingfang',
])

export type TypesetScript = 'zh' | 'en'

export function fontForScript(font: FontId, script: TypesetScript): FontId {
  if (script === 'en' && (isUserFontId(font) || CJK_FONTS.has(font as BuiltinFontId))) return 'newsreader'
  return font
}

const WARM_PAPER: ReadonlySet<ThemeId> = new Set(['paper', 'cream'])

export function themeForScript(theme: ThemeId, script: TypesetScript): ThemeId {
  if (script === 'en' && WARM_PAPER.has(theme)) return 'page'
  return theme
}

function emphasisCSS(script: TypesetScript): string {
  // Same face and the same tracking as the paragraph. A heavier cut or an
  // extra stroke fills the letter-spacing and makes the lines look tight.
  const trim = script === 'zh' ? 'text-spacing-trim:inherit !important;' : ''
  return `b,strong{font-family:inherit !important;font-size:inherit !important;font-weight:400 !important;font-synthesis:none !important;line-height:inherit !important;letter-spacing:inherit !important;word-spacing:inherit !important;text-autospace:inherit !important;${trim}font-kerning:inherit !important;line-break:inherit !important;text-shadow:none !important;-webkit-text-stroke:0 !important;}`
}

export function bookCSS(
  prefs: Prefs,
  script: TypesetScript = 'zh',
  listening = false,
  listen: ListenType = { size: 26, leading: 2.05 },
): string {
  const theme = themeOf(prefs.theme)
  const stack = fontStack(prefs.font)
  const bodyFace = pinnedBodyFace(stack)
  const dark = Boolean(theme.dark)
  const type = script === 'en' ? englishType(prefs, stack, theme.fg) : chineseType(prefs, theme.fg)
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    ${bodyFace.css}
    html {
      color-scheme: ${dark ? 'dark' : 'light'};
      background: ${theme.bg} !important;
    }
    body {
      color: ${theme.fg} !important;
      background: ${theme.bg} !important;
      font-family: ${bodyFace.family} !important;
      font-size: ${prefs.fontSize}px !important;
      font-weight: 400;
      letter-spacing: ${script === 'en' ? '0' : '0.02em'};
      -webkit-touch-callout: none;
      -webkit-user-select: text;
      user-select: text;
    }
    ${type}
    ${listening ? listeningType(script, listen) : ''}
    ${emphasisCSS(script)}
    a { color: inherit; }
    pre, code {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      text-indent: 0;
      text-autospace: no-autospace;
    }
    img {
      max-inline-size: 100%;
      height: auto;
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
    ${readFocusCSS()}
  `
}

function chineseType(prefs: Prefs, fg: string): string {
  // Drawn by WebKit, not written into the sentence. text-autospace covers the
  // VMark gaps between Han and Latin, digits, and punctuation. space-first
  // squeezes fullwidth punctuation the way a paper page does, and keeps the
  // opening mark at the start of a paragraph. strict keeps a closing mark
  // on the same line as the word before it.
  return `
    body {
      text-autospace: normal;
      text-spacing-trim: space-first;
      line-break: strict;
      font-kerning: normal;
    }
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
      font-family: inherit !important;
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
    body {
      text-autospace: no-autospace;
      font-kerning: normal;
      font-variant-ligatures: common-ligatures contextual;
    }
    p, li, blockquote, dd {
      font-family: inherit !important;
      font-size: inherit !important;
      line-height: ${prefs.lineHeight} !important;
      text-align: start !important;
      -webkit-hyphens: auto;
      hyphens: auto;
      hyphenate-limit-chars: 6 3 3;
      hyphenate-limit-lines: 2;
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

/**
 * Listening is glanced at, not read line by line. One short measure, larger
 * type, no first-line indent, and a full breath between paragraphs. The page
 * stays on the same paper and in the same font, so returning to reading is
 * not a different book.
 */
export type ListenType = { size: number; leading: number }

function listeningType(script: TypesetScript, listen: ListenType): string {
  const size = Math.min(34, Math.max(18, Math.round(listen.size)))
  const leading = Math.max(1.6, Math.min(2.6, Math.round(listen.leading * 100) / 100))
  return `
    body {
      font-size: ${size}px !important;
      line-height: ${leading} !important;
      letter-spacing: ${script === 'en' ? '0.005em' : '0.015em'};
    }
    p, li, blockquote, dd {
      line-height: ${leading} !important;
      text-indent: 0 !important;
      text-align: start !important;
      margin: 0 auto 0.95em !important;
      max-inline-size: 30em;
    }
    li { margin-bottom: 0.55em !important; }
    blockquote { margin-left: auto !important; margin-right: auto !important; }
    h1, h2, h3, h4 {
      text-align: start !important;
      margin: 1.4em auto 0.8em !important;
      max-inline-size: 30em;
    }
    span.leaf-tr,
    [data-leaf-tr] {
      max-inline-size: 30em;
      margin-left: auto !important;
      margin-right: auto !important;
      line-height: ${Math.max(1.75, leading - 0.25)} !important;
    }
  `
}

export function withFontFaces(css: string, fontFaces: string): string {
  return `${fontFaces}\n${css}`
}

/** The read-aloud mark tokens resolve out of the app stylesheet. */
export type ReaderMarkColors = { line: string; word: string; blend: string }

export function readerMarkColors(): ReaderMarkColors {
  const read = (name: string): string => {
    try {
      return getComputedStyle(window.document.documentElement).getPropertyValue(name).trim()
    } catch {
      return ''
    }
  }
  return {
    line: read('--leaf-read-line'),
    word: read('--leaf-read-word'),
    blend: read('--leaf-read-blend') || 'multiply',
  }
}

/**
 * Dark papers invert the marker: multiply would vanish into the dark page, so
 * the marks switch to screen with deep amber tones. Kept next to THEMES because
 * dark paper is a reader concept — the app shell has no dark mode of its own.
 */
const DARK_PAPER_MARKS = {
  line: '#5A4A00',
  word: '#6E3A00',
  blend: 'screen',
}

export function readerCSS(
  prefs: Prefs,
  script: TypesetScript,
  fontFaces: string,
  listening = false,
  marks: ReaderMarkColors = readerMarkColors(),
  listen: ListenType = { size: 26, leading: 2.05 },
): string {
  const adapted = {
    ...prefs,
    font: fontForScript(prefs.font, script),
    theme: themeForScript(prefs.theme, script),
  }
  const theme = themeOf(adapted.theme)
  const mark = theme.dark
    ? { ...DARK_PAPER_MARKS }
    : { ...marks, blend: marks.blend || 'multiply' }
  const markVars =
    `:root { --leaf-read-line: ${mark.line}; --leaf-read-word: ${mark.word}; --leaf-read-blend: ${mark.blend}; ` +
    `--leaf-read-wash: ${withAlpha(theme.bg, 0.55)}; }`
  return withFontFaces(`${markVars}\n${bookCSS(adapted, script, listening, listen)}`, fontFaces)
}

/** #RRGGBB plus alpha for overlay washes that must fade toward the paper. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const channels = [m[1], m[2], m[3]].map((part) => Number.parseInt(part, 16))
  const prefix = 'rgba'
  return `${prefix}(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`
}
