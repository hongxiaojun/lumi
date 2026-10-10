import type { AiChunk } from './types'

export function searchChunks(chunks: AiChunk[], query: string, limit = 8): AiChunk[] {
  const terms = tokenize(query)
  if (!terms.length) return []
  const hits: AiChunk[] = []
  for (const chunk of chunks) {
    const hay = chunk.text.toLowerCase()
    if (terms.every((term) => hay.includes(term))) {
      hits.push(chunk)
      if (hits.length >= limit) break
    }
  }
  return hits
}

function tokenize(query: string): string[] {
  const trimmed = query.normalize('NFKC').trim().toLowerCase()
  if (!trimmed) return []
  const latin = trimmed.match(/[a-z0-9]+/g) ?? []
  if (latin.length) return latin
  return [trimmed]
}
