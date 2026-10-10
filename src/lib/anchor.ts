import * as CFI from 'foliate-js/epubcfi.js'

export const QUOTE_CONTEXT = 32

const FOLD: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u00a0': ' ',
  '\u3000': ' ',
}

export type QuoteSelector = {
  exact: string
  prefix?: string
  suffix?: string
}

export type LocateStatus = 'anchored' | 'ambiguous' | 'orphan'

type Point = { node: Text; offset: number }

type Highlight = {
  cfi: string
  text: string
  prefix?: string
  suffix?: string
}

export type ResolvedHighlight =
  | { status: 'anchored'; cfi: string; moved: boolean }
  | { status: 'ambiguous' }
  | { status: 'orphan' }
  | { status: 'elsewhere' }

export function normalizeQuote(text: string): string {
  let out = ''
  let spaced = false
  for (const raw of text) {
    const ch = FOLD[raw] ?? raw
    if (/\s/u.test(ch)) {
      spaced = out.length > 0
      continue
    }
    if (spaced) out += ' '
    spaced = false
    out += ch
  }
  return out
}

export function locateQuote(source: string, quote: QuoteSelector): LocateStatus {
  const hay = normalizeQuote(source)
  const exact = normalizeQuote(quote.exact)
  const prefix = normalizeQuote(quote.prefix ?? '')
  const suffix = normalizeQuote(quote.suffix ?? '')
  if (!exact) return 'orphan'
  let count = 0
  let from = 0
  while (from < hay.length) {
    const at = hay.indexOf(exact, from)
    if (at < 0) break
    const before = hay.slice(0, at).trimEnd()
    const after = hay.slice(at + exact.length).trimStart()
    if ((!prefix || before.endsWith(prefix)) && (!suffix || after.startsWith(suffix))) count += 1
    if (count > 1) return 'ambiguous'
    from = at + 1
  }
  return count === 1 ? 'anchored' : 'orphan'
}

export function occursVerbatim(source: string, exact: string): boolean {
  return locateQuote(source, { exact }) !== 'orphan'
}

function skipped(node: Node): boolean {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement
  return Boolean(el?.closest?.('[data-leaf-tr], [data-leaf-menu]'))
}

function stream(root: Node): { text: string; points: Point[] } {
  const doc = root.ownerDocument
  if (!doc) return { text: '', points: [] }
  const points: Point[] = []
  let text = ''
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return skipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    },
  })
  let current = walker.nextNode()
  while (current) {
    const value = current.nodeValue ?? ''
    for (let i = 0; i < value.length; i += 1) {
      const ch = FOLD[value[i]] ?? value[i]
      if (/\s/u.test(ch)) {
        if (text.length && !text.endsWith(' ')) {
          text += ' '
          points.push({ node: current as Text, offset: i })
        }
        continue
      }
      text += ch
      points.push({ node: current as Text, offset: i })
    }
    current = walker.nextNode()
  }
  return { text, points }
}

function pointBefore(point: Point, container: Node, offset: number): boolean {
  if (point.node === container) return point.offset < offset
  const pos = point.node.compareDocumentPosition(container)
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return true
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return false
  return false
}

function boundary(points: Point[], container: Node, offset: number): number {
  const at = points.findIndex((point) => !pointBefore(point, container, offset))
  return at < 0 ? points.length : at
}

export function contextForRange(root: Node, range: Range, len = QUOTE_CONTEXT): { prefix: string; suffix: string } {
  const { text, points } = stream(root)
  const start = boundary(points, range.startContainer, range.startOffset)
  const end = boundary(points, range.endContainer, range.endOffset)
  return {
    prefix: text.slice(Math.max(0, start - len), start),
    suffix: text.slice(end, end + len),
  }
}

function matchQuote(root: Node, quote: QuoteSelector): { status: 'anchored'; range: Range } | { status: 'ambiguous' | 'orphan' } {
  const { text, points } = stream(root)
  const exact = normalizeQuote(quote.exact)
  const prefix = normalizeQuote(quote.prefix ?? '')
  const suffix = normalizeQuote(quote.suffix ?? '')
  if (!exact) return { status: 'orphan' }
  const hits: number[] = []
  let from = 0
  while (from < text.length && hits.length < 2) {
    const at = text.indexOf(exact, from)
    if (at < 0) break
    const before = text.slice(0, at).trimEnd()
    const after = text.slice(at + exact.length).trimStart()
    if ((!prefix || before.endsWith(prefix)) && (!suffix || after.startsWith(suffix))) hits.push(at)
    from = at + 1
  }
  if (hits.length !== 1) return { status: hits.length === 0 ? 'orphan' : 'ambiguous' }
  const start = hits[0]
  const end = start + exact.length
  const a = points[start]
  const b = points[end - 1]
  const doc = root.ownerDocument
  if (!a || !b || !doc) return { status: 'orphan' }
  const range = doc.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset + 1)
  return { status: 'anchored', range }
}

function rangeIn(doc: Document, cfi: string, sectionIndex?: number): Range | 'elsewhere' | 'broken' {
  try {
    const parts = CFI.parse(cfi) as { parent?: Array<{ index?: number }[] | unknown> }
    if (cfi.includes('!') && parts?.parent) {
      const index = CFI.fake.toIndex(parts.parent[0] as { index: number }[])
      if (sectionIndex == null || index !== sectionIndex) return 'elsewhere'
      parts.parent.shift()
    }
    const range = CFI.toRange(doc, parts)
    if (!range?.startContainer) return 'broken'
    return range
  } catch {
    return 'broken'
  }
}

function rejoin(original: string, local: string, sectionIndex?: number): string {
  if (!original.includes('!')) return local
  const base = sectionIndex == null ? original.slice(0, original.indexOf('!')) + ')' : CFI.fake.fromIndex(sectionIndex)
  return CFI.joinIndir(base, local)
}

type PaintView = {
  addAnnotation: (annotation: { value: string; color?: string }) => Promise<unknown>
  renderer?: { getContents?: () => Array<{ doc?: Document; index: number }> }
}

export async function paintStoredHighlights<T extends Highlight & { anchor?: 'ambiguous' | 'orphan' }>(
  view: PaintView,
  rows: T[],
  colorFor: (row: T) => string,
  onUpdate: (row: T) => void,
): Promise<void> {
  const contents = view.renderer?.getContents?.() ?? []
  for (const row of rows) {
    let handled = false
    for (const content of contents) {
      if (!content.doc || typeof content.index !== 'number') continue
      const hit = resolveHighlight(content.doc, row, content.index)
      if (hit.status === 'elsewhere') continue
      handled = true
      if (hit.status === 'anchored') {
        await view.addAnnotation({ value: hit.cfi, color: colorFor(row) })
        if (hit.moved || row.anchor) onUpdate({ ...row, cfi: hit.cfi, anchor: undefined })
      } else if (row.anchor !== hit.status) {
        onUpdate({ ...row, anchor: hit.status })
      }
      break
    }
    if (!handled) await view.addAnnotation({ value: row.cfi, color: colorFor(row) })
  }
}

export function resolveHighlight(doc: Document, row: Highlight, sectionIndex?: number): ResolvedHighlight {
  const opened = rangeIn(doc, row.cfi, sectionIndex)
  if (opened === 'elsewhere') return { status: 'elsewhere' }
  if (opened !== 'broken' && normalizeQuote(opened.toString()) === normalizeQuote(row.text)) {
    return { status: 'anchored', cfi: row.cfi, moved: false }
  }
  const match = matchQuote(doc.body ?? doc, { exact: row.text, prefix: row.prefix, suffix: row.suffix })
  if (match.status !== 'anchored') return match
  const local = CFI.fromRange(match.range)
  const cfi = rejoin(row.cfi, local, sectionIndex)
  return { status: 'anchored', cfi, moved: cfi !== row.cfi }
}
