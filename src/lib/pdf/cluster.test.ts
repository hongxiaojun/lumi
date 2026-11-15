import { describe, expect, it } from 'vitest'
import { clusterLines, linesToHtml, type PdfRun } from './cluster'
import { restyleDocument } from '../typeset'

function run(str: string, x: number, y: number, h = 12, w = str.length * 8): PdfRun {
  return { str, x, y, w, h }
}

describe('clusterLines', () => {
  it('joins fragments on the same Y into one line, no space between CJK', () => {
    const lines = clusterLines([
      run('甚', 100, 500, 12, 12),
      run('至能够找到', 112, 501, 12, 72),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('甚至能够找到')
  })

  it('inserts a space between English fragments', () => {
    const lines = clusterLines([
      run('Hello', 50, 400, 12, 40),
      run('world', 96, 400, 12, 40),
    ])
    expect(lines[0].text).toBe('Hello world')
  })

  it('keeps a ligature run attached to the rest of its word', () => {
    // pdf.js hands back "fi" as its own run, and the rest of the word starts at
    // exactly its right edge: no gap at all, so the letter-to-letter space rule
    // must not fire.
    const lines = clusterLines([
      run('These ', 50, 400, 9, 26),
      run('fi', 76, 400, 9, 4.97),
      run('ndings', 80.97, 400, 9, 32),
    ])
    expect(lines[0].text).toBe('These findings')
  })

  it('keeps a ligature run attached on both sides', () => {
    // The ligature lands mid-word as often as at the start: "identi" + "fi" +
    // "es" must not become "identi fi es".
    const lines = clusterLines([
      run('evidence and identi', 48, 400, 9, 139.17),
      run('fi', 187.2, 400, 9, 4.97),
      run('es gaps', 192.19, 400, 9, 44),
    ])
    expect(lines[0].text).toBe('evidence and identifies gaps')
  })

  it('does not glue a ligature run across a real word gap', () => {
    const lines = clusterLines([
      run('fi', 50, 400, 9, 4.97),
      run('ndings', 62, 400, 9, 32),
    ])
    expect(lines[0].text).toBe('fi ndings')
  })

  it('splits different Y into two lines (PDF y-up: larger y is above)', () => {
    const lines = clusterLines([
      run('上一行', 50, 520, 12, 48),
      run('下一行', 50, 500, 12, 48),
    ])
    expect(lines.map((l) => l.text)).toEqual(['上一行', '下一行'])
  })

  it('keeps same-baseline runs in different columns as separate lines', () => {
    const lines = clusterLines([
      run('left column tail', 72, 500, 12, 240),
      run('right column head', 350, 500, 12, 240),
    ])
    expect(lines.map((l) => l.text)).toEqual(['left column tail', 'right column head'])
  })

  it('splits the columns when a bigger heading starts the next one', () => {
    // Page 4 of a two-column journal, measured with pdftotext -bbox: the left
    // column's last run ends at 288.03 and the right column's heading starts at
    // 305.97, so the gutter is 17.94 pt. The body is 9 pt but the heading is
    // 10 pt, and measuring the 17.94 pt with the heading's em gives 1.79 em —
    // under LINE_SPLIT_EM. That is how "results Comparison" used to appear at
    // the head of a paragraph mid-sentence.
    const lines = clusterLines([
      run('findings', 259.14, 709, 9, 28.89),
      run('Comparison', 305.97, 709, 10, 50.37),
    ])
    expect(lines.map((l) => l.text)).toEqual(['findings', 'Comparison'])
  })

  it('still joins words inside a column on a page with a gutter', () => {
    const lines = clusterLines([
      run('the left column', 48, 500, 9, 120),
      run('tail', 172, 500, 9, 20),
      run('Comparison', 306, 500, 9, 50),
      run('of groups', 360, 500, 9, 45),
    ])
    expect(lines.map((l) => l.text)).toEqual(['the left column tail', 'Comparison of groups'])
  })

  it('groups by baseline even when the columns arrive one after the other', () => {
    // The content stream writes a whole column at a time, so every left run
    // comes before any right run. Pairing each run with whichever one happened
    // to be read last glued the wrong ends together; each row must be found
    // from the baselines instead.
    const lines = clusterLines([
      run('left one', 48, 510, 9, 100),
      run('left two', 48, 499, 9, 100),
      run('right one', 306, 510, 9, 100),
      run('right two', 306, 499, 9, 100),
    ])
    expect(lines.map((l) => l.text)).toEqual(['left one', 'right one', 'left two', 'right two'])
  })

  it('does not treat a word space repeated down the page as a gutter', () => {
    const lines = clusterLines([
      run('one', 48, 510, 9, 40),
      run('two', 92, 510, 9, 40),
      run('three', 48, 498, 9, 40),
      run('four', 92, 498, 9, 40),
    ])
    expect(lines.map((l) => l.text)).toEqual(['one two', 'three four'])
  })

  it('still joins runs across a normal word gap', () => {
    const lines = clusterLines([
      run('Hello', 72, 500, 12, 40),
      run('world', 116, 500, 12, 40),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Hello world')
  })
})

describe('linesToHtml then restyleDocument', () => {
  it('unwraps a leftover wrap 甚/至 after restyle', () => {
    const lines = clusterLines([
      run('改变了位置之后，可能看法会截然不同，甚', 72, 600, 14, 280),
      run('至能够找到更优质的解决方法。', 72, 584, 14, 220),
    ])
    const html = linesToHtml(lines)
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    restyleDocument(doc, 'zh')
    expect((doc.body.textContent ?? '').replace(/\s+/g, '')).toContain(
      '截然不同，甚至能够找到更优质的解决方法。',
    )
    expect(doc.querySelectorAll('p')).toHaveLength(1)
  })

  it('keeps a large vertical gap as two paragraphs', () => {
    const lines = clusterLines([
      run('我们总说：屁股决定脑袋。', 72, 600, 14, 200),
      run('面对学习这件事的时候，这句话同样适用。', 72, 540, 14, 260),
    ])
    const html = linesToHtml(lines)
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })
})
