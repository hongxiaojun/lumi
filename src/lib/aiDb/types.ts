import type { ScriptKind } from '../translate/lang'

export type AiChunk = {
  id: string
  chapter: number
  heading?: string
  tag: string
  text: string
}

export type AiChapter = {
  index: number
  title: string
  href?: string
  text: string
  headings: string[]
}

export type AiBookMeta = {
  id: string
  title: string
  author: string
  fileName: string
  language?: ScriptKind | string
}

export type AiBook = AiBookMeta & {
  slug: string
  chapters: AiChapter[]
  chunks: AiChunk[]
}

export type CatalogEntry = {
  slug: string
  title: string
  author: string
  language?: string
}

export type AiSection = {
  title?: string
  href?: string
  html: string
}
