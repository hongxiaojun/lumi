import type { BookLook } from './bookLook'
import type { FontId, Prefs } from '../types'

/** A full CJK face fits. Larger files stay out of the book CSS. */
export const USER_FONT_BYTES_MAX = 32 * 1024 * 1024

export type UserFontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2'

export type UserFont = {
  id: string
  name: string
  format: UserFontFormat
  bytes: Uint8Array
  addedAt: number
}

export type UserFontDraft = {
  name: string
  bytes: Uint8Array
}

const FORMAT_BY_EXT: Record<string, UserFontFormat> = {
  ttf: 'truetype',
  otf: 'opentype',
  woff: 'woff',
  woff2: 'woff2',
}

export function isUserFontId(id: string): id is `user:${string}` {
  return /^user:[A-Za-z0-9]+$/.test(id)
}

/** Family and storage ids stay inside an app token. File names never become CSS. */
export function userFontKey(id: string): string {
  const raw = id.startsWith('user:') ? id.slice('user:'.length) : id
  return raw.replace(/[^A-Za-z0-9]/g, '')
}

export function userFontFamily(key: string): string {
  return `leaf-user-${userFontKey(key)}`
}

export function userFontId(key: string): `user:${string}` {
  return `user:${userFontKey(key)}`
}

export function userFontStack(id: string): string {
  return `"${userFontFamily(id)}", "Songti SC", "Noto Serif SC", serif`
}

export function fontFormatOf(fileName: string): UserFontFormat | null {
  const base = fileName.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return null
  return FORMAT_BY_EXT[base.slice(dot + 1).toLowerCase()] ?? null
}

function visibleLabel(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 32) out += char
  }
  return out
}

export function fontDisplayName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const stem = visibleLabel(dot > 0 ? base.slice(0, dot) : base)
  const trimmed = stem.trim()
  const chars = [...trimmed]
  if (chars.length === 0) return '未命名字体'
  return chars.slice(0, 40).join('')
}

export function createUserFont(
  file: UserFontDraft,
  now: number,
  id: string,
): UserFont | { error: string } {
  if (file.bytes.byteLength === 0) return { error: '这个字体文件是空的' }
  if (file.bytes.byteLength > USER_FONT_BYTES_MAX) return { error: '字体文件超过 32MB，没有加进去' }
  const format = fontFormatOf(file.name)
  if (!format) return { error: '只能添加 ttf、otf、woff 或 woff2' }
  const key = userFontKey(id)
  if (!key) return { error: '字体编号无效' }
  return {
    id: key,
    name: fontDisplayName(file.name),
    format,
    bytes: file.bytes.slice(),
    addedAt: now,
  }
}

export function addUserFont(fonts: readonly UserFont[], made: UserFont): UserFont[] {
  return [...fonts.filter((font) => font.id !== made.id), made]
}

export function removeUserFont(fonts: readonly UserFont[], id: string): UserFont[] {
  const key = userFontKey(id)
  return fonts.filter((font) => font.id !== key)
}

export function collectUserFonts(
  existing: readonly UserFont[],
  files: readonly UserFontDraft[],
  now: number,
  ids: readonly string[],
): { fonts: UserFont[]; error: string | null } {
  let fonts = [...existing]
  let error: string | null = null
  files.forEach((file, index) => {
    const made = createUserFont(file, now, ids[index] ?? '')
    if ('error' in made) {
      error = made.error
      return
    }
    fonts = addUserFont(fonts, made)
  })
  return { fonts, error }
}

export function nextFontAfterRemoval(active: FontId, removedId: string, fallback: FontId): FontId {
  return active === userFontId(removedId) ? fallback : active
}

export function templateWithFont(template: Prefs, font: FontId): Prefs {
  return { ...template, font }
}

export function looksWithFont(looks: Record<string, BookLook>, font: FontId): Record<string, BookLook> {
  const next: Record<string, BookLook> = {}
  for (const [id, look] of Object.entries(looks)) next[id] = { ...look, font }
  return next
}

/** Books that used another face stay as they are. */
export function looksReplacingFont(
  looks: Record<string, BookLook>,
  from: FontId,
  to: FontId,
): Record<string, BookLook> {
  let changed = false
  const next: Record<string, BookLook> = {}
  for (const [id, look] of Object.entries(looks)) {
    if (look.font !== from) {
      next[id] = look
      continue
    }
    next[id] = { ...look, font: to }
    changed = true
  }
  return changed ? next : looks
}

export async function retireUserFont(
  removedId: string,
  ports: {
    fonts: readonly UserFont[]
    active: FontId
    fallback: FontId
    template: Prefs
    saveFonts: (fonts: UserFont[]) => Promise<void>
    saveTemplate: (prefs: Prefs) => Promise<void>
    patchLooks: (from: FontId, to: FontId) => Promise<void>
  },
): Promise<{ fonts: UserFont[]; font: FontId }> {
  const fonts = removeUserFont(ports.fonts, removedId)
  await ports.saveFonts(fonts)
  const font = nextFontAfterRemoval(ports.active, removedId, ports.fallback)
  if (font !== ports.active) await ports.saveTemplate(templateWithFont(ports.template, font))
  await ports.patchLooks(userFontId(removedId), font)
  return { fonts, font }
}

export async function persistGlobalFont(
  font: FontId,
  ports: {
    template: Prefs
    saveTemplate: (prefs: Prefs) => Promise<void>
    patchLooks: (font: FontId) => Promise<void>
  },
): Promise<Prefs> {
  const template = templateWithFont(ports.template, font)
  await ports.saveTemplate(template)
  await ports.patchLooks(font)
  return template
}

let faceCss = ''
let publishedFonts: readonly UserFont[] = []
let publishedKey = ''
const listeners = new Set<() => void>()

export function setUserFontFaces(css: string): void {
  if (css === faceCss) return
  faceCss = css
  for (const listener of listeners) listener()
}

/** The book iframe drops a data: font, so every added face fell through to Songti. */
export function publishUserFonts(next: readonly UserFont[]): void {
  const key = next.map((font) => `${font.id}:${font.bytes.byteLength}:${font.addedAt}`).join('|')
  publishedFonts = next.map((font) => ({ ...font, bytes: font.bytes.slice() }))
  if (key === publishedKey) return
  publishedKey = key
  faceCss = ''
  for (const listener of listeners) listener()
}

function fontBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

const FACE_TRIES: FontFaceDescriptors[] = [
  { weight: '100 900', style: 'normal', display: 'swap' },
  { weight: '400', style: 'normal', display: 'swap' },
]

async function loadFace(Ctor: typeof FontFace, family: string, bytes: Uint8Array): Promise<FontFace | null> {
  for (const descriptors of FACE_TRIES) {
    try {
      const face = new Ctor(family, fontBuffer(bytes), descriptors)
      await face.load()
      return face
    } catch {
      // A range the document refuses is retried at the body weight.
    }
  }
  return null
}

/** Puts each added file on the book document. Returns true when a new face loaded. */
export async function mountUserFonts(doc: Document): Promise<boolean> {
  const Ctor = doc.defaultView?.FontFace
  const fonts = doc.fonts
  if (!Ctor || !fonts || publishedFonts.length === 0) return false
  const have = new Set<string>()
  fonts.forEach((face) => {
    if (face.family) have.add(face.family)
  })
  let loaded = false
  await Promise.all(
    publishedFonts.map(async (font) => {
      const family = userFontFamily(font.id)
      if (have.has(family)) return
      have.add(family)
      const face = await loadFace(Ctor, family, font.bytes)
      if (!face) {
        have.delete(family)
        return
      }
      fonts.add(face)
      loaded = true
    }),
  )
  return loaded
}

export function currentUserFontFaces(): string {
  return faceCss
}

export function subscribeUserFontFaces(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Built-in faces stay in the sheet. Added files are mounted on the book document. */
export function readingFontFaces(builtin: string): string {
  if (!builtin) return faceCss
  if (!faceCss) return builtin
  return `${builtin}\n${faceCss}`
}
