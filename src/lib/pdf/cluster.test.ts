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

  it('splits different Y into two lines (PDF y-up: larger y is above)', () => {
    const lines = clusterLines([
      run('上一行', 50, 520, 12, 48),
      run('下一行', 50, 500, 12, 48),
    ])
    expect(lines.map((l) => l.text)).toEqual(['上一行', '下一行'])
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
