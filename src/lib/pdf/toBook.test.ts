import { describe, expect, it } from 'vitest'
import { pagesToChapters, pdfDisplayAuthor, pdfDisplayTitle, pdfToEpubFile } from './toBook'
import type { PdfRun } from './cluster'

function run(str: string, x: number, y: number): PdfRun {
  return { str, x, y, w: str.length * 8, h: 12 }
}

describe('pagesToChapters', () => {
  it('builds restyled HTML that joins a CJK wrap remnant', () => {
    const pages = [[
      run('改变了位置之后，可能看法会截然不同，甚', 72, 600),
      run('至能够找到更优质的解决方法。', 72, 584),
    ]]
    const chapters = pagesToChapters(pages, [800], '试读')
    expect(chapters[0].html).toContain('甚至能够')
  })

  it('splits chapters at outline page starts', () => {
    const pages = [
      [run('封面', 72, 400)],
      [run('第一章正文。', 72, 400)],
      [run('第二章正文。', 72, 400)],
    ]
    const chapters = pagesToChapters(pages, [800, 800, 800], '书', [0, 1, 2], [
      { pageIndex: 1, title: '第一章' },
      { pageIndex: 2, title: '第二章' },
    ])
    expect(chapters.map((c) => c.title)).toEqual(['书 1', '第一章', '第二章'])
    expect(chapters[1].html).toContain('第一章正文')
    expect(chapters[2].html).toContain('第二章正文')
  })

  it('skips a leading empty cover chapter', () => {
    const pages = [[], [run('正文开始。', 72, 400)]]
    const chapters = pagesToChapters(pages, [800, 800], '书', [0, 1])
    expect(chapters).toHaveLength(1)
    expect(chapters[0].html).toContain('正文开始')
  })

  it('keeps a figure between the lines above and below it', () => {
    const pages = [[
      run('上面的字。', 72, 500),
      run('下面的字。', 72, 200),
    ]]
    const figures = [[{ top: 360, name: 'img/p001-1.jpg', bytes: new Uint8Array([0xff, 0xd8]) }]]
    const html = pagesToChapters(pages, [800], '书', undefined, undefined, figures)[0].html
    const above = html.indexOf('上面的字')
    const img = html.indexOf('src="img/p001-1.jpg"')
    const below = html.indexOf('下面的字')
    expect(above).toBeGreaterThanOrEqual(0)
    expect(above).toBeLessThan(img)
    expect(img).toBeLessThan(below)
  })

  it('keeps a page that has only a figure', () => {
    const figures = [[{ top: 400, name: 'img/p001-1.jpg', bytes: new Uint8Array([0xff, 0xd8]) }]]
    const chapters = pagesToChapters([[]], [800], '书', [0], undefined, figures)
    expect(chapters[0].html).toContain('<img src="img/p001-1.jpg"')
  })

  it('reads a two-column page left column first', () => {
    const html = pagesToChapters([twoColumnPage()], [800], '书', undefined, undefined, undefined, {
      widths: [595],
    })[0].html
    // The last line of the left column must still come before the first of the
    // right one; a y-sorted page interleaves them.
    expect(html.indexOf('left line number 9')).toBeLessThan(html.indexOf('right line number 0'))
  })

  it('places a figure by reading order, not by page height', () => {
    const figures = [[{ top: 600, name: 'img/p001-1.jpg', bytes: new Uint8Array([0xff, 0xd8]) }]]
    const html = pagesToChapters([twoColumnPage()], [800], '书', undefined, undefined, figures, {
      widths: [595],
    })[0].html
    const img = html.indexOf('src="img/p001-1.jpg"')
    expect(html.indexOf('right line number 0')).toBeGreaterThan(img)
    expect(html.indexOf('left line number 7')).toBeLessThan(img)
    expect(html.indexOf('left line number 8')).toBeGreaterThan(img)
  })

  it('keeps y order when the page width is unknown', () => {
    const html = pagesToChapters([twoColumnPage()], [800], '书')[0].html
    expect(html.indexOf('right line number 0')).toBeLessThan(html.indexOf('left line number 1'))
  })
})

/** Two 160pt columns sharing baselines, the shape that used to interleave. */
function twoColumnPage(): PdfRun[] {
  const left = Array.from({ length: 10 }, (_, i) => run(`left line number ${i}`, 72, 700 - i * 14))
  const right = Array.from({ length: 10 }, (_, i) => run(`right line number ${i}`, 340, 700 - i * 14))
  return [...left, ...right]
}

describe('pdfDisplayTitle', () => {
  it('falls back to the file name when metadata is empty or generic', () => {
    expect(pdfDisplayTitle('', '长期主义.pdf')).toBe('长期主义')
    expect(pdfDisplayTitle('PDF Export', '定投.pdf')).toBe('定投')
    expect(pdfDisplayTitle('1000 小时', 'x.pdf')).toBe('1000 小时')
  })
})

describe('pdfDisplayAuthor', () => {
  it('uses metadata when present and 未知作者 otherwise', () => {
    expect(pdfDisplayAuthor('李笑来')).toBe('李笑来')
    expect(pdfDisplayAuthor('')).toBe('未知作者')
  })

  it('refuses a typesetting tool that a PDF filed as its Creator', () => {
    // extractPdf falls back to Creator when Author is empty, and a journal PDF
    // exported from Arbortext puts "Arbortext Advanced Print Publisher
    // 9.1.405/W Unicode" there. The library showed that as the book's author.
    expect(pdfDisplayAuthor('Arbortext Advanced Print Publisher 9.1.405/W Unicode')).toBe('未知作者')
    expect(pdfDisplayAuthor('Adobe Acrobat 11.0.23')).toBe('未知作者')
    expect(pdfDisplayAuthor('Microsoft® Word for Microsoft 365')).toBe('未知作者')
    expect(pdfDisplayAuthor('pdfTeX-1.40.25')).toBe('未知作者')
    expect(pdfDisplayAuthor('macOS Version 14.0 (Build 23A344) Quartz PDFContext')).toBe('未知作者')
  })

  it('keeps a person whose name merely looks like software', () => {
    expect(pdfDisplayAuthor('John TeXeira')).toBe('John TeXeira')
    expect(pdfDisplayAuthor('陈丹青')).toBe('陈丹青')
  })
})

describe('pdfToEpubFile', () => {
  it('returns an EPUB zip', async () => {
    const file = pdfToEpubFile({
      title: 'Hello',
      author: 'PDF',
      language: 'en',
      pages: [[run('Hello world.', 50, 400)]],
      heights: [800],
    })
    expect(file.name).toMatch(/\.epub$/)
    const buf = new Uint8Array(await file.arrayBuffer())
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    const text = new TextDecoder().decode(buf)
    expect(text).toContain('nav.xhtml')
    expect(text).toContain('Hello world')
    expect(text).toContain('epub:type="toc"')
  })

  it('declares the book language on the chapter html', async () => {
    const file = pdfToEpubFile({
      title: 'Hello',
      author: 'PDF',
      language: 'en',
      pages: [[run('Hello world.', 50, 400)]],
      heights: [800],
    })
    const text = new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()))
    expect(text).toContain('xml:lang="en"')
    expect(text).not.toContain('xml:lang="zh"')
  })

  it('stores a figure JPEG beside the chapter that shows it', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0x11, 0xff, 0xd9])
    const file = pdfToEpubFile({
      title: '图',
      author: 'PDF',
      language: 'zh',
      pages: [[run('上文。', 40, 300)]],
      heights: [800],
      figures: [[{ top: 200, name: 'img/p001-1.jpg', bytes: jpeg }]],
    })
    const buf = new Uint8Array(await file.arrayBuffer())
    const text = new TextDecoder().decode(buf)
    expect(text).toContain('<img src="img/p001-1.jpg" alt=""/>')
    const start = text.indexOf('<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh">')
    const chapter = text.slice(start - 39, text.indexOf('</html>', start) + '</html>'.length)
    const doc = new DOMParser().parseFromString(chapter, 'application/xhtml+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('img/p001-1.jpg')
    expect(text).toContain('image/jpeg')
    expect(buf.indexOf(0xff)).toBeGreaterThanOrEqual(0)
    const at = findBytes(buf, jpeg)
    expect(at).toBeGreaterThan(0)
  })
})

function findBytes(hay: Uint8Array, needle: Uint8Array): number {
  for (let i = 0; i <= hay.length - needle.length; i += 1) {
    let ok = true
    for (let j = 0; j < needle.length; j += 1) if (hay[i + j] !== needle[j]) ok = false
    if (ok) return i
  }
  return -1
}
