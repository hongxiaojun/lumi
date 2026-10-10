import type { FontId } from '../types'
import serifZh from '@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff2?url'
import serifLat from '@fontsource/noto-serif-sc/files/noto-serif-sc-latin-400-normal.woff2?url'
import sansZh from '@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2?url'
import sansLat from '@fontsource/noto-sans-sc/files/noto-sans-sc-latin-400-normal.woff2?url'
import news400 from '@fontsource/newsreader/files/newsreader-latin-400-normal.woff2?url'
import news400i from '@fontsource/newsreader/files/newsreader-latin-400-italic.woff2?url'

type HostedFont = {
  id: FontId
  family: string
  locals: readonly string[]
  file: string
  format: 'truetype'
}

// Unmodified files in public/fonts. The book lives in a blob iframe, so the
// face url has to be absolute. The browser fetches a file only after that
// family is chosen.
export const HOSTED_FONTS: readonly HostedFont[] = [
  {
    id: 'kinghwa',
    family: '京華老宋体',
    locals: ['京華老宋体', 'KingHwa_OldSong'],
    file: '/fonts/京華老宋体v2.002.ttf',
    format: 'truetype',
  },
  {
    id: 'wenkai',
    family: '霞鹜文楷 GB 屏幕阅读版',
    locals: ['霞鹜文楷 GB 屏幕阅读版', 'LXGW WenKai GB Screen'],
    file: '/fonts/LXGWWenKaiGBScreen.ttf',
    format: 'truetype',
  },
  {
    id: 'zhuque',
    family: '朱雀仿宋（预览测试版）',
    locals: ['朱雀仿宋（预览测试版）', 'Zhuque Fangsong (technical preview)'],
    file: '/fonts/ZhuqueFangsong-Regular.ttf',
    format: 'truetype',
  },
]

export function hostedStack(id: FontId, fallback: string): string {
  const font = HOSTED_FONTS.find((item) => item.id === id)
  if (!font) return fallback
  const names = [font.family, ...font.locals.filter((name) => name !== font.family)]
  return `${names.map((name) => `"${name}"`).join(', ')}, ${fallback}`
}

export function hostedFontFaces(origin: string): string {
  return HOSTED_FONTS.map((font) => {
    const href = new URL(font.file, origin).href
    const locals = font.locals.map((name) => `local("${name}")`).join(',')
    return `@font-face{font-family:"${font.family}";font-weight:400;font-style:normal;font-display:swap;src:${locals},url("${href}") format("${font.format}");}`
  }).join('\n')
}

let cached: Promise<string> | null = null

export function loadFontFaces(): Promise<string> {
  cached ??= build()
  return cached
}

async function build(): Promise<string> {
  const faces = await Promise.all([
    face('Noto Serif SC', serifZh, 400),
    face('Noto Serif SC', serifLat, 400),
    face('Noto Sans SC', sansZh, 400),
    face('Noto Sans SC', sansLat, 400),
    face('Newsreader', news400, 400),
    face('Newsreader', news400i, 400, 'italic'),
  ])
  const hosted = typeof window === 'undefined' ? '' : hostedFontFaces(window.location.href)
  return [...faces, hosted].filter(Boolean).join('\n')
}

async function face(
  family: string,
  url: string,
  weight: number,
  style = 'normal',
): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`字体加载失败: ${family}`)
  const b64 = toBase64(await res.arrayBuffer())
  return `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");}`
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
