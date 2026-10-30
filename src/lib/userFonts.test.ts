import { afterEach, describe, expect, it } from 'vitest'
import type { BookLook } from './bookLook'
import { DEFAULT_PREFS, fontForScript, fontStack, readerCSS } from './styles'
import {
  addUserFont,
  collectUserFonts,
  createUserFont,
  currentUserFontFaces,
  fontDisplayName,
  isUserFontId,
  looksReplacingFont,
  looksWithFont,
  mountUserFonts,
  nextFontAfterRemoval,
  persistGlobalFont,
  publishUserFonts,
  retireUserFont,
  readingFontFaces,
  removeUserFont,
  setUserFontFaces,
  subscribeUserFontFaces,
  templateWithFont,
  USER_FONT_BYTES_MAX,
  userFontId,
  type UserFont,
} from './userFonts'

function mount(doc: object): Promise<boolean> {
  return mountUserFonts(doc as unknown as Document)
}

const look = {
  theme: 'night' as const,
  font: 'song' as const,
  fontSize: 18,
  lineHeight: 1.6,
  flow: 'scrolled' as const,
  justify: false,
  focusRead: true,
}

function fontOf(name: string, bytes: number[] = [0, 1, 2, 255], id = 'abc'): UserFont {
  const made = createUserFont({ name, bytes: new Uint8Array(bytes) }, 1_700_000_000_000, id)
  if ('error' in made) throw new Error(made.error)
  return made
}

describe('createUserFont', () => {
  it('keeps a chosen ttf as an app-named face and copies the bytes', () => {
    const input = new Uint8Array([0, 1, 2, 255])
    const made = createUserFont({ name: '仓耳今楷02-W04.ttf', bytes: input }, 5, 'ab-cd')
    if ('error' in made) throw new Error(made.error)
    expect(made.id).toBe('abcd')
    expect(made.name).toBe('仓耳今楷02-W04')
    expect(made.format).toBe('truetype')
    expect(made.addedAt).toBe(5)
    expect(Array.from(made.bytes)).toEqual([0, 1, 2, 255])
    input[0] = 9
    expect(made.bytes[0]).toBe(0)
    expect(userFontId(made.id)).toBe('user:abcd')
  })

  it('accepts otf, woff, and woff2 regardless of letter case', () => {
    expect(fontOf('Face.OTF', [1], 'otf1').format).toBe('opentype')
    expect(fontOf('Face.WOFF', [1], 'woff1').format).toBe('woff')
    expect(fontOf('Face.WOFF2', [1], 'woff21').format).toBe('woff2')
    expect(fontOf('C:/Fonts/仓耳.ttf', [1], 'path1').name).toBe('仓耳')
    expect(fontOf('..\\..\\仓耳.otf', [1], 'path2').name).toBe('仓耳')
  })

  it('rejects empty files, unknown types, and a missing id', () => {
    expect(createUserFont({ name: 'a.ttf', bytes: new Uint8Array() }, 1, 'abc')).toEqual({
      error: '这个字体文件是空的',
    })
    expect(createUserFont({ name: 'notes.txt', bytes: new Uint8Array([1]) }, 1, 'abc')).toEqual({
      error: '只能添加 ttf、otf、woff 或 woff2',
    })
    expect(createUserFont({ name: 'font', bytes: new Uint8Array([1]) }, 1, 'abc')).toEqual({
      error: '只能添加 ttf、otf、woff 或 woff2',
    })
    expect(createUserFont({ name: '.ttf', bytes: new Uint8Array([1]) }, 1, 'abc')).toEqual({
      error: '只能添加 ttf、otf、woff 或 woff2',
    })
    expect(createUserFont({ name: 'a.ttf', bytes: new Uint8Array([1]) }, 1, '!!!')).toEqual({
      error: '字体编号无效',
    })
  })

  it('rejects a file over 32MB and accepts one at the limit', () => {
    const over = { byteLength: USER_FONT_BYTES_MAX + 1 } as unknown as Uint8Array
    expect(createUserFont({ name: 'big.ttf', bytes: over }, 1, 'abc')).toEqual({
      error: '字体文件超过 32MB，没有加进去',
    })
    const atLimit = {
      byteLength: USER_FONT_BYTES_MAX,
      slice() {
        return new Uint8Array([7])
      },
    } as unknown as Uint8Array
    const made = createUserFont({ name: 'big.ttf', bytes: atLimit }, 1, 'abc')
    if ('error' in made) throw new Error(made.error)
    expect(Array.from(made.bytes)).toEqual([7])
  })

  it('names a blank file 未命名字体 and keeps the label short', () => {
    expect(fontDisplayName('   .ttf')).toBe('未命名字体')
    expect(fontDisplayName('仓\n耳.woff2')).toBe('仓耳')
    expect(fontDisplayName(`${'楷'.repeat(41)}.ttf`)).toBe('楷'.repeat(40))
    expect(fontOf('   .ttf', [1], 'blank1').name).toBe('未命名字体')
  })

  it('keeps a valid file when the next one is rejected', () => {
    const saved = collectUserFonts(
      [],
      [
        { name: '好.ttf', bytes: new Uint8Array([1]) },
        { name: '坏.txt', bytes: new Uint8Array([2]) },
      ],
      9,
      ['good', 'bad'],
    )
    expect(saved.error).toBe('只能添加 ttf、otf、woff 或 woff2')
    expect(saved.fonts).toHaveLength(1)
    expect(saved.fonts[0]?.id).toBe('good')
    expect(saved.fonts[0]?.name).toBe('好')
  })
})

describe('user font face', () => {
  afterEach(() => {
    publishUserFonts([])
  })

  function faceDoc(onCreate?: (family: string) => void, onLoad?: (family: string) => void) {
    const sources: Array<BufferSource | string> = []
    const added: string[] = []
    class FakeFontFace {
      family: string
      constructor(
        family: string,
        source: BufferSource | string,
        descriptors?: { weight?: string; style?: string; display?: string },
      ) {
        this.family = family
        sources.push(source)
        onCreate?.(family)
        expect(typeof source).not.toBe('string')
        expect(descriptors).toMatchObject({ weight: '100 900', style: 'normal', display: 'swap' })
      }
      load() {
        onLoad?.(this.family)
        return Promise.resolve(this)
      }
    }
    const doc = {
      defaultView: { FontFace: FakeFontFace },
      fonts: {
        faces: [] as FakeFontFace[],
        forEach(fn: (face: FakeFontFace) => void) {
          this.faces.forEach(fn)
        },
        add(face: FakeFontFace) {
          this.faces.push(face)
          added.push(face.family)
        },
      },
    }
    return { doc, sources, added }
  }

  it('keeps the file out of the book css and still names the chosen face', () => {
    publishUserFonts([fontOf('仓耳";}.ttf', [0, 1, 2, 255], 'abc')])
    const book = readerCSS({ ...DEFAULT_PREFS, font: userFontId('abc') }, 'zh', readingFontFaces('builtin'))
    expect(book).toContain('font-family: "leaf-user-abc"')
    expect(book).toContain('builtin')
    expect(book).not.toContain('data:')
    expect(book).not.toContain('仓耳')
    expect(book).not.toMatch(/url\s*\(/)
    expect(book).not.toContain('local("leaf-user-abc")')
    expect(book).not.toContain('mianfeiziti')
  })

  it('loads an added font from its own bytes so switching faces changes the page', async () => {
    publishUserFonts([fontOf('仓耳.ttf', [9, 8, 7], 'one')])
    const { doc, sources, added } = faceDoc()
    expect(await mount(doc)).toBe(true)
    expect(await mount(doc)).toBe(false)
    expect(added).toEqual(['leaf-user-one'])
    expect(new Uint8Array(sources[0] as ArrayBuffer)).toEqual(new Uint8Array([9, 8, 7]))
  })

  it('copies every byte, including past one chunk', async () => {
    const bytes = new Uint8Array(0x8001)
    bytes[0] = 65
    bytes[0x7fff] = 66
    bytes[0x8000] = 67
    const font = fontOf('wide.ttf', [1], 'wide')
    font.bytes = bytes
    publishUserFonts([font])
    const { doc, sources } = faceDoc()
    await mount(doc)
    expect(new Uint8Array(sources[0] as ArrayBuffer)).toEqual(bytes)
  })

  it('skips a face that cannot be constructed or loaded and keeps the next one', async () => {
    publishUserFonts([
      fontOf('bad.ttf', [1], 'bad'),
      fontOf('mid.otf', [2], 'mid'),
      fontOf('good.woff2', [3, 4], 'good'),
    ])
    const added: string[] = []
    class FakeFontFace {
      family = ''
      constructor(family: string, source: BufferSource | string) {
        if (typeof source === 'string' || family.endsWith('bad')) throw new Error('bad file')
        this.family = family
      }
      load() {
        if (this.family.endsWith('mid')) return Promise.reject(new Error('unreadable'))
        return Promise.resolve(this)
      }
    }
    const doc = {
      defaultView: { FontFace: FakeFontFace },
      fonts: {
        forEach(fn: (face: FakeFontFace) => void) {
          added.forEach((family) => fn({ family, load: () => Promise.resolve(null) }))
        },
        add(face: FakeFontFace) {
          added.push(face.family)
        },
      },
    }
    expect(await mount(doc)).toBe(true)
    expect(added).toEqual(['leaf-user-good'])
  })

  it('uses the body weight when the document refuses a weight range', async () => {
    publishUserFonts([fontOf('a.ttf', [4], 'one')])
    const weights: string[] = []
    const added: string[] = []
    class FakeFontFace {
      family: string
      constructor(family: string, source: BufferSource | string, descriptors?: { weight?: string }) {
        this.family = family
        weights.push(descriptors?.weight ?? '')
        if (typeof source === 'string') throw new Error('url')
      }
      load() {
        if (weights.at(-1) === '100 900') return Promise.reject(new Error('range'))
        return Promise.resolve(this)
      }
    }
    const doc = {
      defaultView: { FontFace: FakeFontFace },
      fonts: {
        forEach(_fn: (face: FakeFontFace) => void) {},
        add(face: FakeFontFace) {
          added.push(face.family)
        },
      },
    }
    expect(await mount(doc)).toBe(true)
    expect(weights).toEqual(['100 900', '400'])
    expect(added).toEqual(['leaf-user-one'])
  })

  it('leaves the page alone when the document cannot load a face', async () => {
    publishUserFonts([fontOf('a.ttf', [1], 'one')])
    await expect(mount({ defaultView: null })).resolves.toBe(false)
    await expect(mount({ defaultView: {} })).resolves.toBe(false)
  })

  it('asks the open book to restyle only when the added files change', () => {
    let calls = 0
    const stop = subscribeUserFontFaces(() => {
      calls += 1
    })
    publishUserFonts([fontOf('a.ttf', [1], 'one')])
    publishUserFonts([fontOf('a.ttf', [1], 'one')])
    publishUserFonts([fontOf('b.ttf', [2], 'two')])
    stop()
    expect(calls).toBe(2)
    expect(currentUserFontFaces()).toBe('')
  })
})

describe('global font', () => {
  afterEach(() => {
    setUserFontFaces('')
  })

  it('changes the device template and every saved look, and leaves size and paper alone', () => {
    const font = userFontId('abc')
    const template = templateWithFont(
      { ...DEFAULT_PREFS, fontSize: 22, theme: 'night', parallel: false, focusRead: true },
      font,
    )
    expect(template.font).toBe('user:abc')
    expect(template.fontSize).toBe(22)
    expect(template.theme).toBe('night')
    expect(template.parallel).toBe(false)
    expect(template.focusRead).toBe(true)
    expect(DEFAULT_PREFS.font).toBe('localkai')

    const original: BookLook = { ...look }
    const next = looksWithFont({ novel: original }, font)
    expect(next.novel?.font).toBe('user:abc')
    expect(next.novel?.fontSize).toBe(18)
    expect(next.novel?.theme).toBe('night')
    expect(next.novel?.lineHeight).toBe(1.6)
    expect(next.novel?.flow).toBe('scrolled')
    expect(next.novel?.justify).toBe(false)
    expect(next.novel?.focusRead).toBe(true)
    expect(original.font).toBe('song')
    expect(next.novel).not.toBe(original)
    expect(looksWithFont({}, font)).toEqual({})
    expect(JSON.stringify(next)).not.toContain('bytes')
  })

  it('saves the template before rewriting saved looks', async () => {
    const order: string[] = []
    const template = { ...DEFAULT_PREFS, fontSize: 18, theme: 'gray' as const }
    const saved = await persistGlobalFont(userFontId('abc'), {
      template,
      saveTemplate: async (next) => {
        order.push('template')
        expect(next.font).toBe('user:abc')
        expect(next.fontSize).toBe(18)
        expect(next.theme).toBe('gray')
      },
      patchLooks: async (font) => {
        order.push('looks')
        expect(font).toBe('user:abc')
      },
    })
    expect(order).toEqual(['template', 'looks'])
    expect(saved.font).toBe('user:abc')
    expect(template.font).toBe('localkai')
  })

  it('uses the added face for Chinese and Newsreader for English', () => {
    const id = userFontId('abc')
    expect(isUserFontId(id)).toBe(true)
    expect(isUserFontId('user:')).toBe(false)
    expect(isUserFontId('user:<script>')).toBe(false)
    expect(fontStack(id)).toBe('"leaf-user-abc", "Songti SC", "Noto Serif SC", serif')
    expect(fontStack('user:"></style>' as never)).not.toContain('style')
    expect(fontForScript(id, 'zh')).toBe(id)
    expect(fontForScript(id, 'en')).toBe('newsreader')
    expect(readerCSS({ ...DEFAULT_PREFS, font: id }, 'zh', '')).toContain('leaf-user-abc')
    const english = readerCSS({ ...DEFAULT_PREFS, font: id }, 'en', '')
    expect(english).not.toContain('leaf-user-abc')
    expect(english).toContain('Newsreader')
  })

  it('drops a removed face and returns the default only when that face was global', () => {
    const fonts = addUserFont([], fontOf('a.ttf', [1], 'keep'))
    const withGone = addUserFont(fonts, fontOf('b.ttf', [2], 'gone'))
    expect(removeUserFont(withGone, 'gone').map((font) => font.id)).toEqual(['keep'])
    expect(nextFontAfterRemoval(userFontId('gone'), 'gone', DEFAULT_PREFS.font)).toBe('localkai')
    expect(nextFontAfterRemoval(userFontId('keep'), 'gone', DEFAULT_PREFS.font)).toBe('user:keep')
    expect(nextFontAfterRemoval('song', 'gone', DEFAULT_PREFS.font)).toBe('song')
  })

  it('rewrites only the looks that used the removed face', async () => {
    const gone = userFontId('gone')
    const kept: BookLook = { ...look, font: 'song' }
    const using = { ...look, font: gone, fontSize: 22 }
    const next = looksReplacingFont({ kept, using }, gone, 'localkai')
    expect(next.kept).toBe(kept)
    expect(next.using?.font).toBe('localkai')
    expect(next.using?.fontSize).toBe(22)
    expect(using.font).toBe(gone)
    expect(looksReplacingFont({ kept }, gone, 'localkai')).toEqual({ kept })

    const saved: string[] = []
    const retired = await retireUserFont('gone', {
      fonts: [fontOf('b.ttf', [2], 'gone'), fontOf('a.ttf', [1], 'keep')],
      active: 'song',
      fallback: DEFAULT_PREFS.font,
      template: { ...DEFAULT_PREFS, font: 'song', fontSize: 18 },
      saveFonts: async (fonts) => {
        saved.push('fonts')
        expect(fonts.map((font) => font.id)).toEqual(['keep'])
      },
      saveTemplate: async () => {
        saved.push('template')
      },
      patchLooks: async (from, to) => {
        saved.push('looks')
        expect(from).toBe('user:gone')
        expect(to).toBe('song')
      },
    })
    expect(saved).toEqual(['fonts', 'looks'])
    expect(retired.font).toBe('song')

    const wasGlobal = await retireUserFont('gone', {
      fonts: [fontOf('b.ttf', [2], 'gone')],
      active: gone,
      fallback: 'localkai',
      template: { ...DEFAULT_PREFS, font: gone },
      saveFonts: async () => {},
      saveTemplate: async (template) => {
        expect(template.font).toBe('localkai')
        expect(template.fontSize).toBe(DEFAULT_PREFS.fontSize)
      },
      patchLooks: async (from, to) => {
        expect(from).toBe(gone)
        expect(to).toBe('localkai')
      },
    })
    expect(wasGlobal.font).toBe('localkai')
    expect(wasGlobal.fonts).toEqual([])
  })

  it('notifies an open book when the face css changes', () => {
    let calls = 0
    const stop = subscribeUserFontFaces(() => {
      calls += 1
    })
    setUserFontFaces('one')
    setUserFontFaces('one')
    setUserFontFaces('two')
    stop()
    setUserFontFaces('three')
    expect(calls).toBe(2)
    expect(currentUserFontFaces()).toBe('three')
    expect(readingFontFaces('builtin')).toBe('builtin\nthree')
    setUserFontFaces('')
    expect(readingFontFaces('builtin')).toBe('builtin')
    expect(readingFontFaces('')).toBe('')
  })
})
