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
})
