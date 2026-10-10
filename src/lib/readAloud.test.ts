import { describe, expect, it } from 'vitest'
import {
  appendReadAloud,
  bindReadAloud,
  bookClickGate,
  keepReadAloud,
  paintReadAloud,
  readAloudBlocks,
  readAloudFromSelection,
  readAloudInk,
  readAloudLang,
  readAloudMark,
  rangeForSpoken,
  renderReadAloud,
  retargetReadAloud,
  spokenChapterOffset,
  watchReadAloud,
} from './readAloud'

function doc(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body
}

describe('readAloudBlocks', () => {
  it('reads outermost headings, paragraphs, items, and quotations in order', () => {
    const body = doc(`
      <h2>标题</h2>
      <p>原文<span data-leaf-tr="1">译文</span></p>
      <p>甲<em>乙<i class="leaf-tr">丙</i></em>丁</p>
      <blockquote><p>引文</p></blockquote>
      <ul><li><p>条目</p></li></ul>
      <p> </p>
      <p>之</p>
      <nav><p>目录</p></nav>
      <script>secret</script>
      <style>p{}</style>
    `)
    const before = body.innerHTML
    expect(readAloudBlocks(body)).toEqual([
      { tag: 'h2', text: '标题' },
      { tag: 'p', text: '原文' },
      { tag: 'p', text: '甲乙丁' },
      { tag: 'blockquote', text: '引文' },
      { tag: 'li', text: '条目' },
      { tag: 'p', text: '之' },
    ])
    expect(body.innerHTML).toBe(before)
    expect(body.querySelector('[data-leaf-id]')).toBeNull()
  })

  it('skips a translation block and ruby pronunciation', () => {
    const body = doc(`
      <div class="leaf-tr"><p>整段译文</p></div>
      <p data-leaf-tr="1">另一段译文</p>
      <p><ruby>漢<rp>（</rp><rt>han</rt><rp>）</rp></ruby>字</p>
    `)
    expect(readAloudBlocks(body)).toEqual([{ tag: 'p', text: '漢字' }])
  })

  it('collapses whitespace and falls back to loose text when there is no paragraph', () => {
    expect(readAloudBlocks(doc('<p>甲\n\n乙</p>'))).toEqual([{ tag: 'p', text: '甲 乙' }])
    expect(readAloudBlocks(doc('<div>只有格子<script>乙</script></div>'))).toEqual([
      { tag: 'p', text: '只有格子' },
    ])
    expect(readAloudBlocks(doc('<div><p>段落</p></div>'))).toEqual([{ tag: 'p', text: '段落' }])
    expect(readAloudBlocks(doc('<p>   </p><nav>目录</nav>'))).toEqual([])
  })
})

describe('readAloudBlocks XHTML', () => {
  it('reads namespaced paragraphs instead of joining the chapter into one string', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body>
          <p>甲</p>
          <blockquote><p>引文</p></blockquote>
          <nav><p>目录</p></nav>
        </body>
      </html>`
    const parsed = new DOMParser().parseFromString(xml, 'application/xhtml+xml')
    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(readAloudBlocks(parsed.body)).toEqual([
      { tag: 'p', text: '甲' },
      { tag: 'blockquote', text: '引文' },
    ])
  })
})

describe('readAloudLang', () => {
  it('picks a voice language Edge can match', () => {
    expect(readAloudLang('zh')).toBe('zh-CN')
    expect(readAloudLang('mixed')).toBe('zh-CN')
    expect(readAloudLang('en')).toBe('en')
    expect(readAloudLang('other')).toBeNull()
    expect(readAloudLang(undefined)).toBeNull()
  })
})

describe('renderReadAloud', () => {
  it('puts the chapter in one light-DOM article and leaves an unchanged chapter alone', () => {
    const host = document.createElement('div')
    const view = document.createElement('div')
    host.append(view)
    renderReadAloud(host, [{ tag: 'h2', text: '标题' }, { tag: 'p', text: '甲' }], 'zh-CN')
    const article = host.querySelector(':scope > article.read-aloud')
    expect(article).not.toBeNull()
    expect(host.firstElementChild).toBe(article)
    expect(host.lastElementChild).toBe(view)
    expect(article?.getAttribute('lang')).toBe('zh-CN')
    expect(article?.hasAttribute('aria-hidden')).toBe(false)
    expect(article?.hasAttribute('hidden')).toBe(false)
    expect(article?.querySelector('h2')?.textContent).toBe('标题')
    const text = article?.querySelector('p')?.firstChild
    renderReadAloud(host, [{ tag: 'h2', text: '标题' }, { tag: 'p', text: '甲' }], 'zh-CN')
    expect(host.querySelectorAll('article.read-aloud')).toHaveLength(1)
    expect(host.querySelector('p')?.firstChild).toBe(text)
  })

  it('replaces the article when the chapter changes and drops it when the section is empty', () => {
    const host = document.createElement('div')
    renderReadAloud(host, [{ tag: 'custom', text: '<b>x</b>' }], 'en')
    expect(host.querySelector('b')).toBeNull()
    expect(host.querySelector('p')?.textContent).toBe('<b>x</b>')
    renderReadAloud(host, [{ tag: 'p', text: '乙' }], null)
    expect(host.querySelector('p')?.textContent).toBe('乙')
    expect(host.querySelector('article')?.hasAttribute('lang')).toBe(false)
    renderReadAloud(host, [], null)
    expect(host.querySelector('article')).toBeNull()
    renderReadAloud(host, [{ tag: 'p', text: '丙' }], 'zh-CN')
    expect(host.querySelector('p')?.textContent).toBe('丙')
  })
})

function lineWithWord(line: string, word: string, offset: number): HTMLElement {
  const span = document.createElement('msreadoutspan')
  span.className = 'msreadout-line-highlight msreadout-inactive-highlight'
  const token = document.createElement('msreadoutspan')
  token.className = 'msreadout-word-highlight'
  token.textContent = word
  span.append(line.slice(0, offset), token, line.slice(offset + word.length))
  return span
}

describe('readAloudFromSelection', () => {
  it('starts at the selection and keeps the rest of the chapter', () => {
    const body = doc('<p>前文</p><p>黛玉便知是他</p><p>后句在这里</p>')
    const blocks = [...body.querySelectorAll('p')]
    const range = body.ownerDocument.createRange()
    range.setStart(blocks[1].firstChild!, 3)
    range.setEnd(blocks[1].firstChild!, 4)
    expect(readAloudFromSelection(blocks, range)).toEqual([
      { tag: 'p', text: '知是他' },
      { tag: 'p', text: '后句在这里' },
    ])
    const translated = doc('<p>原文<span data-leaf-tr="1">译文</span>继续</p><p>后句</p>')
    const parts = [...translated.querySelectorAll('p')]
    const tail = translated.ownerDocument.createRange()
    tail.setStart(parts[0].childNodes[2], 0)
    tail.setEnd(parts[0].childNodes[2], 2)
    expect(readAloudFromSelection(parts, tail)).toEqual([
      { tag: 'p', text: '继续' },
      { tag: 'p', text: '后句' },
    ])
    const collapsed = body.ownerDocument.createRange()
    collapsed.setStart(blocks[1].firstChild!, 3)
    collapsed.collapse(true)
    expect(readAloudFromSelection(blocks, collapsed)).toBeNull()
  })
})

describe('readAloudMark', () => {
  it('reads the sentence and word Edge wrapped, including an older sentence', () => {
    const article = document.createElement('article')
    const first = document.createElement('p')
    first.textContent = '前文'
    const second = document.createElement('p')
    const older = document.createElement('msreadoutspan')
    older.className = 'msreadout-line-highlight'
    older.textContent = '旧句'
    second.append(older, lineWithWord('黛玉便知是他', '知', 3))
    article.append(first, second)
    expect(readAloudMark(article)).toEqual({
      blockIndex: 1,
      line: '黛玉便知是他',
      word: '知',
      wordOffset: 3,
    })
    older.remove()
    second.querySelector('msreadoutspan')?.remove()
    expect(readAloudMark(article)).toBeNull()
  })
})

describe('rangeForSpoken', () => {
  it('maps the spoken word back onto the book, skipping a translation and collapsed spaces', () => {
    const body = doc('<p>原文<span data-leaf-tr="1">译文</span>继续</p><p>hello   world</p>')
    const [zh, en] = [...body.querySelectorAll('p')]
    const zhRange = rangeForSpoken(zh, '原文继续', '继', 2)
    expect(zhRange?.word?.toString()).toBe('继')
    expect(zhRange?.line.map((range) => range.toString())).toEqual(['原文', '继续'])
    const enRange = rangeForSpoken(en, 'hello world', 'world', 6)
    expect(enRange?.word?.toString()).toBe('world')
    expect(enRange?.line.map((range) => range.toString())).toEqual(['hello   world'])
    const repeated = doc('<p>知知</p>').querySelector('p')!
    expect(rangeForSpoken(repeated, '知知', '知', 1)?.word?.toString()).toBe('知')
    expect(rangeForSpoken(repeated, '知知', '知', 1)?.word?.startOffset).toBe(1)
    const ruby = doc('<p><ruby>漢<rt>かん</rt>字</ruby></p>').querySelector('p')!
    expect(rangeForSpoken(ruby, '漢字', null, null)?.line.map((range) => range.toString())).toEqual(['漢', '字'])
  })

  it('maps a word when Edge inserts spaces the book does not have', () => {
    const source = doc('<p>可动手。</p>').querySelector('p')!
    const range = rangeForSpoken(source, '可 动手 。', '动手', 2)
    expect(range?.line.map((item) => item.toString())).toEqual(['可动手。'])
    expect(range?.word?.toString()).toBe('动手')
    const repeated = doc('<p>知知</p>').querySelector('p')!
    expect(rangeForSpoken(repeated, '知 知', '知', 2)?.word?.startOffset).toBe(1)
    const soft = doc('<p>动\u00ad手</p>').querySelector('p')!
    expect(rangeForSpoken(soft, '动手', '手', 1)?.word?.toString()).toBe('手')
  })

  it('keeps a real space on the later phrase instead of an earlier spaceless word', () => {
    const source = doc('<p>a helloworld b hello   world</p>').querySelector('p')!
    const range = rangeForSpoken(source, 'hello world', 'world', 6)
    expect(range?.word?.toString()).toBe('world')
    expect(range?.line.map((item) => item.toString())).toEqual(['hello   world'])
  })
})

describe('paintReadAloud', () => {
  it('paints the sentence and the word, and follows only when asked', () => {
    const source = doc('<p>黛玉便知是他</p>').querySelector('p')!
    const mark = { blockIndex: 0, line: '黛玉便知是他', word: '知', wordOffset: 3 }
    const painted: string[] = []
    const removed: string[] = []
    const followed: string[] = []
    const painter = {
      add: (key: string, range: Range) => painted.push(`${key}:${range.toString()}`),
      remove: (key: string) => removed.push(key),
    }
    paintReadAloud(mark, [source], painter, (range) => followed.push(range.toString()))
    expect(painted).toEqual(['leaf-read-line:黛玉便知是他', 'leaf-read-word:知'])
    expect(followed).toEqual(['黛玉便知是他'])
    followed.length = 0
    paintReadAloud(mark, [source], painter, null)
    expect(followed).toEqual([])
    painted.length = 0
    paintReadAloud(null, [source], painter, (range) => followed.push(range.toString()))
    expect(painted).toEqual([])
    expect(followed).toEqual([])
    expect(removed).toContain('leaf-read-word')
  })

  it('paints around a translation instead of covering it', () => {
    const source = doc('<p>原文<span data-leaf-tr="1">译文</span>继续</p>').querySelector('p')!
    const painted: string[] = []
    const followed: string[] = []
    paintReadAloud(
      { blockIndex: 0, line: '原文继续', word: '继', wordOffset: 2 },
      [source],
      {
        add: (key, range) => painted.push(`${key}:${range.toString()}`),
        remove: () => {},
      },
      (range) => followed.push(range.toString()),
    )
    expect(painted).toEqual(['leaf-read-line:原文', 'leaf-read-line:1:继续', 'leaf-read-word:继'])
    expect(followed).toEqual(['原文'])
  })

  it('keeps the previous highlight when the spoken line is not in this chapter', () => {
    const source = doc('<p>黛玉便知是他</p>').querySelector('p')!
    const removed: string[] = []
    const painter = {
      add: () => {},
      remove: (key: string) => removed.push(key),
    }
    paintReadAloud(
      { blockIndex: 0, line: '黛玉便知是他', word: '知', wordOffset: 3 },
      [source],
      painter,
      null,
    )
    removed.length = 0
    let followed = false
    const painted = paintReadAloud(
      { blockIndex: 0, line: '这句话不在书里', word: '不', wordOffset: 3 },
      [source],
      painter,
      () => { followed = true },
    )
    expect(painted).toBe(false)
    expect(followed).toBe(false)
    expect(removed).toEqual([])
  })

  it('finds the sentence in another block when the article index has drifted', () => {
    const other = doc('<p>别的句子</p>').querySelector('p')!
    const source = doc('<p>可动手。</p>').querySelector('p')!
    const painted: string[] = []
    const ok = paintReadAloud(
      { blockIndex: 0, line: '可 动手 。', word: '动手', wordOffset: 2 },
      [other, source],
      {
        add: (key, range) => painted.push(`${key}:${range.toString()}`),
        remove: () => {},
      },
      null,
    )
    expect(ok).toBe(true)
    expect(painted).toContain('leaf-read-word:动手')
  })
})

describe('readAloudInk', () => {
  it('uses a light blue sentence and a light cyan word that stay clear of the paper', () => {
    const line = readAloudInk('leaf-read-line')
    const word = readAloudInk('leaf-read-word')
    const part = readAloudInk('leaf-read-line:1')
    expect(part).toEqual(line)
    expect(line.opacity).toBeGreaterThanOrEqual(0.65)
    expect(word.opacity).toBeGreaterThanOrEqual(0.65)
    const lineRgb = rgb(line.color)
    const wordRgb = rgb(word.color)
    expect(lineRgb.b).toBeGreaterThan(lineRgb.r + 40)
    expect(lineRgb.b).toBeGreaterThan(lineRgb.g)
    expect(wordRgb.g).toBeGreaterThan(150)
    expect(wordRgb.b).toBeGreaterThan(150)
    expect(wordRgb.r).toBeLessThan(80)
    for (const paper of ['#F3E9D7', '#E4D0A8', '#F7F1E3', '#FFFFFF', '#CDE7C3', '#1A1A1A', '#121212']) {
      expect(distance(blend(line.color, line.opacity, paper), paper)).toBeGreaterThan(80)
      expect(distance(blend(word.color, word.opacity, paper), paper)).toBeGreaterThan(80)
    }
  })
})

function rgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function blend(hex: string, opacity: number, paper: string): { r: number; g: number; b: number } {
  const ink = rgb(hex)
  const back = rgb(paper)
  const mix = (inkPart: number, paperPart: number) => Math.round(opacity * inkPart + (1 - opacity) * paperPart)
  return { r: mix(ink.r, back.r), g: mix(ink.g, back.g), b: mix(ink.b, back.b) }
}

function distance(
  a: { r: number; g: number; b: number },
  hex: string,
): number {
  const b = rgb(hex)
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
}

describe('spoken chapter feed', () => {
  it('finds a chapter already in the article and appends the next one without wiping the highlight', () => {
    const host = document.createElement('div')
    renderReadAloud(host, [{ tag: 'p', text: '本章一句' }, { tag: 'p', text: '本章二句' }], 'zh-CN')
    const article = host.querySelector('article')!
    article.dataset.leafSpeaking = '1'
    article.children[0].replaceChildren(lineWithWord('本章一句', '本', 0))
    expect(spokenChapterOffset(article, [{ tag: 'p', text: '本章一句' }, { tag: 'p', text: '本章二句' }])).toBe(0)
    expect(spokenChapterOffset(article, [{ tag: 'p', text: '下一章' }])).toBeNull()
    expect(appendReadAloud(host, [{ tag: 'p', text: '下一章' }], 'zh-CN')).toBe(true)
    expect(appendReadAloud(host, [{ tag: 'p', text: '下一章' }], 'zh-CN')).toBe(false)
    expect(article.querySelector('.msreadout-word-highlight')?.textContent).toBe('本')
    expect([...article.children].map((el) => el.textContent)).toEqual(['本章一句', '本章二句', '下一章'])
    expect(keepReadAloud(host, [{ tag: 'p', text: '下一章' }], 'zh-CN')).toBe(2)
    expect(article.querySelector('.msreadout-word-highlight')?.textContent).toBe('本')
    expect(article.children).toHaveLength(3)
  })

  it('replaces a chapter Edge has not reached and keeps reading it', () => {
    const host = document.createElement('div')
    document.body.append(host)
    renderReadAloud(host, [{ tag: 'p', text: '本章' }], 'zh-CN')
    host.querySelector('article')!.dataset.leafSpeaking = '1'
    expect(keepReadAloud(host, [{ tag: 'p', text: '另一章的句子' }], 'zh-CN')).toBe(0)
    expect(host.querySelector('p')?.textContent).toBe('另一章的句子')
    expect(document.getSelection()?.toString()).toContain('另一章的句子')
    host.remove()
    document.getSelection()?.removeAllRanges()
  })
})

describe('watchReadAloud', () => {
  it('reports a mark after Edge inserts the highlight', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.textContent = '黛玉便知是他'
    article.append(p)
    const seen: string[] = []
    const stop = watchReadAloud(article, (mark) => {
      if (mark?.word) seen.push(mark.word)
    })
    p.replaceChildren(lineWithWord('黛玉便知是他', '知', 3))
    await new Promise((resolve) => setTimeout(resolve, 30))
    stop()
    expect(seen).toEqual(['知'])
  })

  it('holds the highlight through the gap before the next word', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.append(lineWithWord('黛玉便知是他', '知', 3))
    article.append(p)
    const seen: Array<string | null> = []
    const stop = watchReadAloud(article, (mark) => {
      seen.push(mark?.word ?? null)
    })
    p.replaceChildren(document.createTextNode('黛玉便知是他'))
    await flush()
    expect(seen).toEqual(['知'])
    p.replaceChildren(lineWithWord('黛玉便知是他', '是', 4))
    await flush()
    expect(seen).toEqual(['知', '是'])
    stop()
  })

  it('clears the highlight after the mark stays gone', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.append(lineWithWord('黛玉便知是他', '知', 3))
    article.append(p)
    const seen: Array<string | null> = []
    const stop = watchReadAloud(article, (mark) => {
      seen.push(mark?.word ?? null)
    })
    p.replaceChildren(document.createTextNode('黛玉便知是他'))
    await new Promise((resolve) => setTimeout(resolve, 250))
    stop()
    expect(seen).toEqual(['知', null])
  })

  it('retries the same mark when the page was not ready', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.textContent = '黛玉便知是他'
    article.append(p)
    let ready = false
    const seen: string[] = []
    const stop = watchReadAloud(article, (mark) => {
      if (!ready || !mark?.word) return false
      seen.push(mark.word)
    })
    p.replaceChildren(lineWithWord('黛玉便知是他', '知', 3))
    await flush()
    expect(seen).toEqual([])
    ready = true
    p.querySelector('.msreadout-word-highlight')?.classList.add('ready')
    await flush()
    stop()
    expect(seen).toEqual(['知'])
  })
})

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 30))
}

function drawOnNextFrame(): () => void {
  const real = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  }
  return () => {
    window.requestAnimationFrame = real
  }
}

describe('bindReadAloud', () => {
  it('turns to a new sentence and repaints the next word in place', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.textContent = '黛玉便知是他'
    article.append(p)
    const source = document.createElement('p')
    source.textContent = '黛玉便知是他'
    const added: string[] = []
    const scrolled: string[] = []
    let redraws = 0
    const restore = drawOnNextFrame()
    const stop = bindReadAloud(article, [source], document, () => ({
      add: (key, range, color, opacity) => added.push(`${key}:${range.toString()}:${color}:${opacity}`),
      remove: () => {},
      redraw: () => { redraws += 1 },
      scrollTo: (range) => {
        scrolled.push(range.toString())
        return Promise.resolve()
      },
    }))
    try {
      p.replaceChildren(lineWithWord('黛玉便知是他', '知', 3))
      await flush()
      expect(scrolled).toEqual(['黛玉便知是他'])
      expect(added).toEqual([
        'leaf-read-line:黛玉便知是他:#2F8FE8:0.74',
        'leaf-read-word:知:#14C8C4:0.84',
      ])
      expect(redraws).toBe(2)
      added.length = 0
      p.replaceChildren(lineWithWord('黛玉便知是他', '是', 4))
      await flush()
      expect(scrolled).toEqual(['黛玉便知是他'])
      expect(added).toEqual([
        'leaf-read-line:黛玉便知是他:#2F8FE8:0.74',
        'leaf-read-word:是:#14C8C4:0.84',
      ])
      expect(redraws).toBe(2)
    } finally {
      stop()
      restore()
    }
  })

  it('follows a sentence when Edge inserts spaces the book does not have', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.textContent = '可动手。'
    article.append(p)
    const source = document.createElement('p')
    source.textContent = '可动手。'
    const painted: string[] = []
    const scrolled: string[] = []
    const removed: string[] = []
    const stop = bindReadAloud(article, [source], document, () => ({
      add: (key, range) => painted.push(`${key}:${range.toString()}`),
      remove: (key) => removed.push(key),
      redraw: () => {},
      scrollTo: (range) => { scrolled.push(range.toString()) },
    }))
    p.replaceChildren(lineWithWord('可 动手 。', '动手', 2))
    await flush()
    expect(scrolled).toEqual(['可动手。'])
    expect(painted).toContain('leaf-read-word:动手')
    removed.length = 0
    p.replaceChildren(document.createTextNode('可 动手 。'))
    await flush()
    expect(removed).toEqual([])
    stop()
  })

  it('waits to follow until the page can take the mark', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.textContent = '黛玉便知是他'
    article.append(p)
    const source = document.createElement('p')
    source.textContent = '黛玉便知是他'
    const scrolled: string[] = []
    let surface: {
      add: () => void
      remove: () => void
      redraw: () => void
      scrollTo: (range: Range) => void
    } | null = null
    const stop = bindReadAloud(article, [source], document, () => surface)
    p.replaceChildren(lineWithWord('黛玉便知是他', '知', 3))
    await flush()
    expect(scrolled).toEqual([])
    surface = {
      add: () => {},
      remove: () => {},
      redraw: () => {},
      scrollTo: (range) => { scrolled.push(range.toString()) },
    }
    p.querySelector('.msreadout-word-highlight')?.classList.add('ready')
    await flush()
    stop()
    expect(scrolled).toEqual(['黛玉便知是他'])
  })

  it('does not turn the page while a drag is still held', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.textContent = '黛玉便知是他'
    article.append(p)
    const source = document.createElement('p')
    source.textContent = '黛玉便知是他'
    document.body.append(source)
    const range = document.createRange()
    range.setStart(source.firstChild!, 0)
    range.setEnd(source.firstChild!, 2)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const scrolled: string[] = []
    const added: string[] = []
    const stop = bindReadAloud(article, [source], document, () => ({
      add: (key, textRange) => added.push(`${key}:${textRange.toString()}`),
      remove: () => {},
      redraw: () => {},
      scrollTo: (textRange) => { scrolled.push(textRange.toString()) },
    }))
    document.dispatchEvent(new MouseEvent('mousedown'))
    p.replaceChildren(lineWithWord('黛玉便知是他', '知', 3))
    await flush()
    expect(scrolled).toEqual([])
    expect(added).toContain('leaf-read-word:知')
    document.dispatchEvent(new MouseEvent('mouseup'))
    const next = document.createElement('p')
    next.textContent = '后句在这里'
    article.append(next)
    source.textContent = '黛玉便知是他后句在这里'
    next.replaceChildren(lineWithWord('后句在这里', '在', 2))
    await flush()
    expect(scrolled).toEqual(['后句在这里'])
    selection?.removeAllRanges()
    source.remove()
    stop()
  })

  it('does not open the next chapter while a drag is still held', async () => {
    const article = document.createElement('article')
    const current = document.createElement('p')
    current.textContent = '本章'
    const next = document.createElement('p')
    next.textContent = '下一章的句子'
    article.append(current, next)
    const source = document.createElement('p')
    source.textContent = '本章'
    let past = 0
    const stop = bindReadAloud(article, [source], document, () => ({
      add: () => {},
      remove: () => {},
      redraw: () => {},
      scrollTo: () => {},
    }), {
      onPast: () => { past += 1 },
    })
    document.dispatchEvent(new MouseEvent('mousedown'))
    next.replaceChildren(lineWithWord('下一章的句子', '下', 0))
    await flush()
    expect(past).toBe(0)
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(past).toBe(1)
    stop()
  })

  it('ignores a late redraw from the sentence it already left', async () => {
    const article = document.createElement('article')
    const first = document.createElement('p')
    first.textContent = '黛玉便知是他'
    const second = document.createElement('p')
    second.textContent = '后句在这里'
    article.append(first, second)
    const sources = [document.createElement('p'), document.createElement('p')]
    sources[0].textContent = '黛玉便知是他'
    sources[1].textContent = '后句在这里'
    const gates: Array<() => void> = []
    let redraws = 0
    const restore = drawOnNextFrame()
    const stop = bindReadAloud(article, sources, document, () => ({
      add: () => {},
      remove: () => {},
      redraw: () => { redraws += 1 },
      scrollTo: () => new Promise<void>((resolve) => { gates.push(resolve) }),
    }))
    try {
      first.replaceChildren(lineWithWord('黛玉便知是他', '知', 3))
      await flush()
      second.replaceChildren(lineWithWord('后句在这里', '在', 2))
      await flush()
      expect(gates).toHaveLength(2)
      gates[0]()
      await flush()
      expect(redraws).toBe(0)
      gates[1]()
      await flush()
      expect(redraws).toBe(2)
    } finally {
      stop()
      restore()
    }
  })

  it('repaints the current sentence on the new page without scrolling again', async () => {
    const article = document.createElement('article')
    const p = document.createElement('p')
    p.append(lineWithWord('黛玉便知是他', '知', 3))
    article.append(p)
    const source = document.createElement('p')
    source.textContent = '黛玉便知是他'
    const added: string[] = []
    let scrolls = 0
    let redraws = 0
    const restore = drawOnNextFrame()
    const stop = bindReadAloud(article, [source], document, () => ({
      add: (key, range) => added.push(`${key}:${range.toString()}`),
      remove: () => {},
      redraw: () => { redraws += 1 },
      scrollTo: () => { scrolls += 1 },
    }))
    try {
      await flush()
      expect(added).toContain('leaf-read-word:知')
      const painted = added.length
      const scrolled = scrolls
      redraws = 0
      stop.replay()
      expect(added.length).toBeGreaterThan(painted)
      expect(scrolls).toBe(scrolled)
      expect(redraws).toBe(2)
      stop.follow()
      await flush()
      expect(scrolls).toBe(scrolled + 1)
    } finally {
      stop()
      restore()
    }
  })

  it('turns to the next chapter when the spoken sentence is already appended', async () => {
    const article = document.createElement('article')
    const current = document.createElement('p')
    current.textContent = '本章'
    const next = document.createElement('p')
    next.textContent = '下一章的句子'
    article.append(current, next)
    const source = document.createElement('p')
    source.textContent = '本章'
    let past = 0
    const stop = bindReadAloud(article, [source], document, () => ({
      add: () => {},
      remove: () => {},
      redraw: () => {},
      scrollTo: () => {},
    }), {
      offset: 0,
      onPast: () => { past += 1 },
    })
    next.replaceChildren(lineWithWord('下一章的句子', '下', 0))
    await flush()
    expect(past).toBe(1)
    next.querySelector('.msreadout-word-highlight')?.classList.add('again')
    await flush()
    expect(past).toBe(1)
    stop()
  })
})

describe('retargetReadAloud', () => {
  it('rewrites the spoken chapter from the selection while Read Aloud is on', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const article = document.createElement('article')
    article.className = 'read-aloud'
    article.dataset.leafSpeaking = '1'
    article.append(Object.assign(document.createElement('p'), { textContent: '前文' }))
    article.append(Object.assign(document.createElement('p'), { textContent: '黛玉便知是他' }))
    host.append(article)
    const body = doc('<p>前文</p><p>黛玉便知是他</p><p>后句在这里</p>')
    const blocks = [...body.querySelectorAll('p')]
    const range = document.createRange()
    range.setStart(blocks[1].firstChild!, 3)
    range.setEnd(blocks[1].firstChild!, 4)
    const scrolled: string[] = []
    const added: string[] = []
    const moved = await retargetReadAloud(host, blocks, range, 'zh-CN', {
      add: (key, textRange) => added.push(`${key}:${textRange.toString()}`),
      remove: () => {},
      redraw: () => {},
      scrollTo: (textRange) => {
        scrolled.push(textRange.toString())
        return Promise.resolve()
      },
    })
    expect(moved).toBe(true)
    expect([...article.children].map((el) => el.textContent)).toEqual(['知是他', '后句在这里'])
    expect(added).toEqual(['leaf-read-line:知是他'])
    expect(scrolled).toEqual(['知是他'])
    expect(document.getSelection()?.toString()).toBe('知是他后句在这里')
    article.dataset.leafSpeaking = ''
    const again = await retargetReadAloud(host, blocks, range, 'zh-CN', null)
    expect(again).toBe(false)
    host.remove()
  })

  it('keeps the page highlight when the spoken passage is replaced', async () => {
    const host = document.createElement('div')
    const article = document.createElement('article')
    article.className = 'read-aloud'
    const p = document.createElement('p')
    p.append(lineWithWord('黛玉便知是他', '知', 3))
    article.append(p)
    host.append(article)
    const cleared: string[] = []
    const stop = watchReadAloud(article, (mark) => {
      if (!mark) cleared.push('clear')
    })
    p.querySelector('.msreadout-word-highlight')?.classList.add('ready')
    await flush()
    const body = doc('<p>黛玉便知是他</p><p>后句在这里</p>')
    const blocks = [...body.querySelectorAll('p')]
    const range = document.createRange()
    range.setStart(blocks[1].firstChild!, 0)
    range.setEnd(blocks[1].firstChild!, 1)
    await retargetReadAloud(host, blocks, range, null, null)
    await flush()
    stop()
    expect(cleared).toEqual([])
    expect(article.textContent).toContain('后句在这里')
  })
})

describe('bookClickGate', () => {
  it('locates speech instead of turning the page when the drag ends on the side', () => {
    const gate = bookClickGate()
    gate.down(false)
    gate.up('知是他')
    expect(gate.click(true, '', 0.1)).toBe('locate')
    expect(gate.click(true, '', 0.9)).toBe('right')
  })

  it('keeps a plain click as a page turn while Read Aloud is on', () => {
    const gate = bookClickGate()
    gate.down(false)
    gate.up('')
    expect(gate.click(true, '', 0.1)).toBe('left')
    expect(gate.click(true, '', 0.5)).toBe('chrome')
    expect(gate.click(true, '', 0.72)).toBe('chrome')
    expect(gate.click(true, '', 0.72 + 0.001)).toBe('right')
  })

  it('does not page while the highlight menu is up, then pages on the next click', () => {
    const gate = bookClickGate()
    gate.down(true)
    gate.up('')
    expect(gate.click(true, '', 0.05)).toBe('note')
    gate.down(false)
    gate.up('')
    expect(gate.click(true, '', 0.05)).toBe('left')
  })

  it('locates when the selection is still on the page at click time', () => {
    const gate = bookClickGate()
    gate.down(false)
    gate.up('')
    expect(gate.click(true, '知是他', 0.1)).toBe('locate')
  })

  it('treats a selection as a highlight when Read Aloud is off', () => {
    const gate = bookClickGate()
    gate.down(false)
    gate.up('黛玉')
    expect(gate.click(false, '', 0.9)).toBe('note')
  })

  it('lets an open highlight win over a selection on the same click', () => {
    const gate = bookClickGate()
    gate.down(true)
    gate.up('黛玉')
    expect(gate.click(true, '黛玉', 0.1)).toBe('note')
  })
})
