import type { LibraryBook } from '../../types'
import type { TocItem } from '../../types'
import { extractAiBook } from './extract'
import type { AiBook, AiSection } from './types'

type FoliateLike = {
  toc?: TocItem[]
  sections?: Array<{
    linear?: string
    id?: string
    createDocument?: () => Promise<Document>
  }>
}

export async function extractFromFoliate(foliate: FoliateLike, book: LibraryBook): Promise<AiBook> {
  const labels = tocLabels(foliate.toc ?? [])
  const sections: AiSection[] = []
  const spine = foliate.sections ?? []
  let linear = 0
  for (const section of spine) {
    if (section.linear === 'no' || !section.createDocument) continue
    let html = ''
    try {
      const doc = await section.createDocument()
      html = doc.body?.innerHTML ?? doc.documentElement?.innerHTML ?? ''
    } catch {
      continue
    }
    const title = labels[section.id ?? ''] ?? labels[String(linear)]
    sections.push({ title, href: section.id, html })
    linear += 1
  }
  return extractAiBook(
    {
      id: book.id,
      title: book.title,
      author: book.author,
      fileName: book.fileName,
      language: book.language,
    },
    sections,
  )
}

function tocLabels(items: TocItem[], map: Record<string, string> = {}): Record<string, string> {
  for (const item of items) {
    const href = item.href?.split('#')[0] ?? ''
    if (href && item.label) map[href] = item.label
    if (item.subitems?.length) tocLabels(item.subitems, map)
  }
  return map
}
