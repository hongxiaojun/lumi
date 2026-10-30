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

export async function extractFromFoliate(
  foliate: FoliateLike,
  book: LibraryBook,
  onStep?: (done: number, total: number) => void,
): Promise<AiBook> {
  const labels = tocLabels(foliate.toc ?? [])
  const sections: AiSection[] = []
  const usable = (foliate.sections ?? []).filter((section) => section.linear !== 'no' && section.createDocument)
  let linear = 0
  onStep?.(0, usable.length)
  for (let i = 0; i < usable.length; i += 1) {
    const section = usable[i]
    let html = ''
    try {
      const doc = await section.createDocument!()
      html = doc.body?.innerHTML ?? doc.documentElement?.innerHTML ?? ''
    } catch {
      html = ''
    }
    if (html) {
      const title = labels[section.id ?? ''] ?? labels[String(linear)]
      sections.push({ title, href: section.id, html })
      linear += 1
    }
    onStep?.(i + 1, usable.length)
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
