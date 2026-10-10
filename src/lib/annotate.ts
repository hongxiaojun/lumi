import type { NoteColor } from './notes'

export type ContentRange = {
  range: Range
  text: string
}

export function nodeElement(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}

export function isDecoratedNode(node: Node): boolean {
  const el = nodeElement(node)
  return Boolean(el?.closest?.('[data-leaf-tr], [data-leaf-menu]'))
}

export function clipRangeToContent(range: Range): ContentRange | null {
  const startEl = nodeElement(range.startContainer)
  const endEl = nodeElement(range.endContainer)
  const startTr = startEl?.closest?.('[data-leaf-tr], [data-leaf-menu]')
  const endTr = endEl?.closest?.('[data-leaf-tr], [data-leaf-menu]')
  if (startTr && endTr) return null
  const next = range.cloneRange()
  if (startTr) next.setStartAfter(startTr)
  if (endTr) next.setEndBefore(endTr)
  const text = next.toString().replace(/\s+/g, ' ').trim()
  if (!text || next.collapsed) return null
  return { range: next, text }
}

export function sectionIndexForRange(
  contents: Array<{ doc?: Document; index: number }>,
  range: Range,
): number | null {
  const doc = range.startContainer.ownerDocument
  if (!doc) return null
  const hit = contents.find((c) => c.doc === doc)
  return typeof hit?.index === 'number' ? hit.index : null
}

export function rangeMenuPoint(
  range: Range,
  host: HTMLElement,
): { top: number; left: number } | null {
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  const win = range.startContainer.ownerDocument?.defaultView
  const iframe = win?.frameElement as HTMLElement | null
  const hostRect = host.getBoundingClientRect()
  const frameRect = iframe?.getBoundingClientRect() ?? { top: 0, left: 0 }
  return {
    top: frameRect.top + rect.top - hostRect.top - 58,
    left: Math.max(8, frameRect.left + rect.left + rect.width / 2 - hostRect.left - 78),
  }
}

export function sameCfi(a: string, b: string): boolean {
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '')
}

export type PenChoice = NoteColor
