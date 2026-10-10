import { occursVerbatim } from '../anchor'
import { chapterFileName } from './slug'
import type { AiBook, CatalogEntry } from './types'

export function renderAiBook(book: AiBook): Record<string, string> {
  const root = book.slug
  const files: Record<string, string> = {
    [`${root}/AI.md`]: renderGuide(book),
    [`${root}/meta.json`]: JSON.stringify(
      {
        id: book.id,
        slug: book.slug,
        title: book.title,
        author: book.author,
        language: book.language ?? '',
        fileName: book.fileName,
        chapters: book.chapters.length,
        chunks: book.chunks.length,
      },
      null,
      2,
    ),
    [`${root}/toc.md`]: renderToc(book),
    [`${root}/digest.md`]: renderDigest(book),
    [`${root}/chunks.jsonl`]: book.chunks.map((chunk) => JSON.stringify(chunk)).join('\n'),
  }
  for (const chapter of book.chapters) {
    const name = chapterFileName(chapter.index - 1, chapter.title)
    files[`${root}/chapters/${name}`] = `# ${chapter.title}\n\n${chapter.text}\n`
  }
  return files
}

export function renderCatalog(entries: CatalogEntry[]): Record<string, string> {
  const rows = entries
    .map((row) => `| ${row.title} | ${row.author} | \`${row.slug}\` | ${row.language ?? ''} |`)
    .join('\n')
  const index = `# Lumi AI 书库

This folder is the AI-accessible library for Lumi.
A book stays dark until it is indexed here; after that, the text is lit and can be quoted.
Each imported book has a directory named by slug. Look up a title in the table, then open that folder's \`AI.md\`.

| Title | Author | Slug | Language |
| ----- | ------ | ---- | -------- |
${rows || '| _(empty)_ |  |  |  |'}

## How to use
1. Find the book by title (this table or \`catalog.json\`).
2. Read \`./<slug>/AI.md\` for the map.
3. For a fast briefing of ideas and structure, read \`digest.md\`.
4. For a topic, search \`chunks.jsonl\` or open the matching file in \`chapters/\`.
5. Quote the book. Do not invent a methodology that is not in the text.
`
  return {
    'INDEX.md': index,
    'catalog.json': JSON.stringify(entries, null, 2),
  }
}

function renderGuide(book: AiBook): string {
  return `# ${book.title}

- Author: ${book.author}
- Language: ${book.language ?? ''}
- Slug: \`${book.slug}\`
- Chapters: ${book.chapters.length}

## What this folder is
A complete, AI-friendly extract of the book. Prefer these files over guessing.

## Fast briefing
Read \`digest.md\` for the skeleton of ideas (chapter openings and headings).

## Full text
- \`toc.md\` — table of contents
- \`chapters/\` — one markdown file per chapter
- \`chunks.jsonl\` — paragraph records \`{id,chapter,heading,text}\`
- \`meta.json\` — identifiers

## How to answer questions
1. Search \`chunks.jsonl\` for keywords from the question.
2. Read the matching chapter file for surrounding context.
3. Quote the book; do not invent claims that are not in the text.
`
}

function renderToc(book: AiBook): string {
  const items = book.chapters
    .map((chapter) => `${chapter.index}. ${chapter.title}`)
    .join('\n')
  return `# ${book.title}\n\n${items}\n`
}

function renderDigest(book: AiBook): string {
  const parts = [`# ${book.title}`, '', `作者：${book.author}`, '', '## 结构', '']
  for (const chapter of book.chapters) {
    parts.push(`${chapter.index}. ${chapter.title}`)
  }
  parts.push('')
  for (const chapter of book.chapters) {
    parts.push(`## ${chapter.title}`, '')
    if (chapter.headings.length) {
      for (const heading of chapter.headings) parts.push(`- ${heading}`)
      parts.push('')
    }
    parts.push(opening(chapter.text), '')
  }
  return parts.join('\n')
}

function opening(text: string, max = 480): string {
  const body = text.replace(/^## .+$/gm, '').replace(/\n{2,}/g, '\n').trim()
  const exact = body.length <= max ? body : body.slice(0, max).trim()
  if (exact && !occursVerbatim(body, exact)) throw new Error('这句话不在正文里')
  return body.length <= max ? body : `${exact}…`
}
