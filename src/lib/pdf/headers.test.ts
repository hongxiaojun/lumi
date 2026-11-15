import { describe, expect, it } from 'vitest'
import { stripRepeatedMargins } from './headers'
import type { PdfLine } from './cluster'

function line(text: string, y: number): PdfLine {
  return { text, y, x0: 72, x1: 200, h: 12 }
}

describe('stripRepeatedMargins', () => {
  it('drops a page number that repeats in the footer zone', () => {
    const pages = [
      [line('第一章', 700), line('正文一段', 650), line('1', 20)],
      [line('继续', 700), line('正文二段', 650), line('2', 22)],
      [line('结尾', 700), line('正文三段', 650), line('3', 18)],
    ]
    const cleaned = stripRepeatedMargins(pages, [800, 800, 800])
    expect(cleaned.flat().map((l) => l.text).join(' ')).not.toMatch(/\b[123]\b/)
    expect(cleaned.flat().some((l) => l.text === '正文一段')).toBe(true)
  })

  it('keeps unique body lines', () => {
    const pages = [
      [line('只出现一次的句子。', 400)],
      [line('另一句完全不同。', 400)],
    ]
    const cleaned = stripRepeatedMargins(pages, [800, 800])
    expect(cleaned.flat().map((l) => l.text)).toEqual(['只出现一次的句子。', '另一句完全不同。'])
  })

  it('drops a print-to-PDF URL sitting in the header zone', () => {
    const pages = [
      [line('https://example.com/post', 790), line('正文明细一句。', 500)],
      [line('https://example.com/post', 788), line('另一段正文。', 500)],
    ]
    const cleaned = stripRepeatedMargins(pages, [800, 800])
    expect(cleaned.flat().map((l) => l.text).join(' ')).not.toMatch(/https?:/)
    expect(cleaned.flat().some((l) => l.text.includes('正文'))).toBe(true)
  })

  it('drops folios in every shape a book uses', () => {
    const folios = [
      '12',
      '- 12 -',
      '— 12 —',
      '· 12 ·',
      '12 / 345',
      '12 of 345',
      'Page 12',
      'Page 12 of 345',
      '第 12 页',
      '第12页',
      '第12页/共345页',
      '　１２　',
      'iv',
      'XII',
    ]
    for (const text of folios) {
      const cleaned = stripRepeatedMargins([[line('正文。', 400), line(text, 20)]], [800])
      expect(cleaned[0].map((l) => l.text), text).toEqual(['正文。'])
    }
  })

  it('drops a lone folio from a single-page PDF', () => {
    const cleaned = stripRepeatedMargins([[line('正文。', 400), line('7', 24)]], [800])
    expect(cleaned[0].map((l) => l.text)).toEqual(['正文。'])
  })

  it('keeps numbers that are body text, a list marker, or a heading', () => {
    const kept = [
      line('2024', 400),
      line('1. 引言', 20),
      line('第 12 页的正文不在页边', 400),
      line('上文 12', 20),
      line('I', 400),
    ]
    const cleaned = stripRepeatedMargins([kept], [800])
    expect(cleaned[0].map((l) => l.text)).toEqual(kept.map((l) => l.text))
  })
})
