import { clipRangeToContent } from './annotate'
import type { TextBlock } from './translate/blocks'
import { extractBlocks } from './translate/blocks'

export function injectTranslations(doc: Document, map: Map<string, string>): number {
  const blocks = extractBlocks(doc)
  let added = 0
  for (const block of blocks) {
    const text = map.get(block.id)
    if (!text) continue
    const el = doc.querySelector(`[data-leaf-id="${cssEscape(block.id)}"]`)
    if (!el || el.nodeType !== 1) continue
    let slot = [...el.children].find((child) => child.getAttribute('data-leaf-tr'))
    if (!slot) {
      slot = doc.createElement('span')
      slot.className = 'leaf-tr'
      slot.setAttribute('data-leaf-tr', '1')
      el.append(slot)
    }
    slot.textContent = text
    added += 1
  }
  return added
}

export function removeTranslations(doc: Document): void {
  for (const node of [...doc.querySelectorAll('[data-leaf-tr]')]) node.remove()
}

export function blocksFromDoc(doc: Document): TextBlock[] {
  return extractBlocks(doc)
}

export type SelectionAction = 'highlight' | 'note' | 'translate'

export function listenBookSelection(
  doc: Document,
  onSelect: (info: { range: Range; text: string } | null) => void,
): () => void {
  const onUp = () => {
    const sel = doc.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      onSelect(null)
      return
    }
    const clipped = clipRangeToContent(sel.getRangeAt(0).cloneRange())
    onSelect(clipped)
  }
  doc.addEventListener('mouseup', onUp)
  return () => doc.removeEventListener('mouseup', onUp)
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return value.replace(/"/g, '\\"')
}
