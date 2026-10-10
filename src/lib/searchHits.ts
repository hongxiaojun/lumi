export const SEARCH_CAP = 100

export type SearchHit = {
  cfi: string
  label: string
  pre: string
  match: string
  post: string
}

export type SearchStep = {
  hits: SearchHit[]
  progress?: number
  done: boolean
  capped: boolean
}

export function isBlankQuery(query: string): boolean {
  return !query.normalize('NFKC').trim()
}

export function collectSearchYield(acc: SearchHit[], event: unknown): SearchStep {
  const capped = acc.length >= SEARCH_CAP
  if (event === 'done') return { hits: acc, done: true, capped }
  if (!event || typeof event !== 'object') return { hits: acc, done: false, capped }

  const rec = event as Record<string, unknown>
  if (typeof rec.progress === 'number' && rec.subitems == null && rec.cfi == null) {
    return { hits: acc, progress: rec.progress, done: false, capped }
  }

  if (Array.isArray(rec.subitems)) {
    if (capped) return { hits: acc, done: false, capped: true }
    const label = typeof rec.label === 'string' ? rec.label : ''
    const extra: SearchHit[] = []
    for (const raw of rec.subitems) {
      if (acc.length + extra.length >= SEARCH_CAP) break
      const item = raw as { cfi?: string; excerpt?: { pre?: string; match?: string; post?: string } }
      if (!item.cfi) continue
      extra.push({
        cfi: item.cfi,
        label,
        pre: item.excerpt?.pre ?? '',
        match: item.excerpt?.match ?? '',
        post: item.excerpt?.post ?? '',
      })
    }
    const hits = acc.concat(extra)
    return { hits, done: false, capped: hits.length >= SEARCH_CAP }
  }

  if (typeof rec.cfi === 'string') {
    if (capped) return { hits: acc, done: false, capped: true }
    const excerpt = (rec.excerpt ?? {}) as { pre?: string; match?: string; post?: string }
    return {
      hits: acc.concat({
        cfi: rec.cfi,
        label: typeof rec.label === 'string' ? rec.label : '',
        pre: excerpt.pre ?? '',
        match: excerpt.match ?? '',
        post: excerpt.post ?? '',
      }),
      done: false,
      capped: acc.length + 1 >= SEARCH_CAP,
    }
  }

  return { hits: acc, done: false, capped }
}

export function searchAcceptNode(node: Node): number {
  if (node.nodeType === 1) {
    const el = node as Element
    const name = el.tagName.toLowerCase()
    if (name === 'script' || name === 'style') return NodeFilter.FILTER_REJECT
    if (el.getAttribute('data-leaf-tr') || el.classList.contains('leaf-tr')) {
      return NodeFilter.FILTER_REJECT
    }
    return NodeFilter.FILTER_SKIP
  }
  return NodeFilter.FILTER_ACCEPT
}
