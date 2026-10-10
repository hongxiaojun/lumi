import { extractBlocks, ownText } from '../translate/blocks'
import { bookSlug } from './slug'
import type { AiBook, AiBookMeta, AiChapter, AiChunk, AiSection } from './types'

export function extractAiBook(meta: AiBookMeta, sections: AiSection[]): AiBook {
  const chapters: AiChapter[] = []
  const chunks: AiChunk[] = []

  for (const section of sections) {
    const doc = new DOMParser().parseFromString(section.html, 'text/html')
    const blocks = extractBlocks(doc.body ?? doc)
    if (!blocks.length) continue
    const headings = [...(doc.body ?? doc).querySelectorAll('h1, h2, h3, h4')]
      .map((node) => ownText(node))
      .filter(Boolean)
    const title = section.title?.trim() || headings[0] || `第 ${chapters.length + 1} 章`
    const index = chapters.length + 1
    const lines: string[] = []
    let heading = title
    for (const block of blocks) {
      if (block.tag.startsWith('h')) {
        heading = block.text
        lines.push(`## ${block.text}`)
        continue
      }
      lines.push(block.text)
      chunks.push({
        id: `${index}.${chunks.length + 1}`,
        chapter: index,
        heading,
        tag: block.tag,
        text: block.text,
      })
    }
    chapters.push({
      index,
      title,
      href: section.href,
      text: lines.join('\n\n'),
      headings,
    })
  }

  return {
    ...meta,
    slug: bookSlug(meta.title),
    chapters,
    chunks,
  }
}
