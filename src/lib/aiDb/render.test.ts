import { describe, expect, it } from 'vitest'
import { extractAiBook } from './extract'
import { renderAiBook, renderCatalog } from './render'

const book = extractAiBook(
  {
    id: 'book-1',
    title: 'The Unit Was Never the Job',
    author: 'Xiaolai',
    fileName: 'unit.epub',
    language: 'en',
  },
  [
    {
      title: 'The unit',
      html: '<h1>The unit</h1><p>The unit was never the job that paid the bills.</p><p>It was the people who stayed.</p>',
    },
  ],
)

describe('renderAiBook', () => {
  it('writes an AI entrypoint, digest, toc, chapter markdown, and jsonl chunks', () => {
    const files = renderAiBook(book)
    expect(files['the-unit-was-never-the-job/AI.md']).toMatch(/The Unit Was Never the Job/)
    expect(files['the-unit-was-never-the-job/AI.md']).toMatch(/digest\.md/)
    expect(files['the-unit-was-never-the-job/toc.md']).toMatch(/The unit/)
    expect(files['the-unit-was-never-the-job/digest.md']).toMatch(/never the job/)
    expect(files['the-unit-was-never-the-job/chapters/01-the-unit.md']).toMatch(/^# The unit/m)
    const lines = files['the-unit-was-never-the-job/chunks.jsonl'].trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    expect(JSON.parse(lines[0]).text).toMatch(/never the job/)
    expect(JSON.parse(files['the-unit-was-never-the-job/meta.json']).title).toBe(
      'The Unit Was Never the Job',
    )
  })
})

describe('renderCatalog', () => {
  it('lists books by title so an agent can find a slug', () => {
    const files = renderCatalog([
      { slug: 'the-unit-was-never-the-job', title: 'The Unit Was Never the Job', author: 'Xiaolai', language: 'en' },
      { slug: '叶读试读', title: '叶读试读', author: '叶', language: 'zh' },
    ])
    expect(files['INDEX.md']).toMatch(/The Unit Was Never the Job/)
    expect(files['INDEX.md']).toMatch(/the-unit-was-never-the-job/)
    expect(files['INDEX.md']).toMatch(/叶读试读/)
    const catalog = JSON.parse(files['catalog.json']) as Array<{ title: string }>
    expect(catalog.map((row) => row.title)).toContain('叶读试读')
  })
})
