import { describe, expect, it } from 'vitest'
import { extractAiBook } from './extract'

const meta = {
  id: 'book-1',
  title: 'The Unit Was Never the Job',
  author: 'Xiaolai',
  fileName: 'unit.epub',
  language: 'en' as const,
}

describe('extractAiBook', () => {
  it('turns HTML sections into chapters and paragraph chunks', () => {
    const book = extractAiBook(meta, [
      {
        title: 'The escalation is measurable',
        html: '<h1>The escalation is measurable</h1><p>The unit was never the job.</p><p>It was the people.</p>',
      },
      {
        title: 'Sources',
        html: '<h2>Sources</h2><p>OpenAI telemetry is the evidence.</p>',
      },
    ])
    expect(book.slug).toBe('the-unit-was-never-the-job')
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters[0].title).toBe('The escalation is measurable')
    expect(book.chapters[0].text).toMatch(/never the job/)
    expect(book.chunks.some((c) => c.text === 'The unit was never the job.')).toBe(true)
    expect(book.chunks.find((c) => c.text === 'It was the people.')?.heading).toBe(
      'The escalation is measurable',
    )
  })

  it('skips empty, nav-only, and whitespace sections', () => {
    const book = extractAiBook(meta, [
      { title: 'Cover', html: '<p>  </p>' },
      { title: 'Nav', html: '<nav><a href="c1">One</a></nav>' },
      { title: 'Body', html: '<p>A complete idea lives in this paragraph.</p>' },
    ])
    expect(book.chapters).toHaveLength(1)
    expect(book.chapters[0].title).toBe('Body')
  })

  it('falls back to the first heading when the TOC label is missing', () => {
    const book = extractAiBook(meta, [
      { html: '<h1>Hidden title</h1><p>Methodology is a way of seeing.</p>' },
    ])
    expect(book.chapters[0].title).toBe('Hidden title')
  })

  it('keeps CJK paragraphs intact', () => {
    const book = extractAiBook({ ...meta, title: '叶读试读', language: 'zh' }, [
      { title: '为什么要自己做阅读器', html: '<p>阅读软件并不缺。缺的是一个安静的地方。</p>' },
    ])
    expect(book.slug).toBe('叶读试读')
    expect(book.chunks[0].text).toMatch(/安静的地方/)
  })

  it('returns no chapters for a book with no extractable text', () => {
    const book = extractAiBook(meta, [{ html: '<img src="cover.jpg" alt="cover">' }])
    expect(book.chapters).toHaveLength(0)
    expect(book.chunks).toHaveLength(0)
  })
})
