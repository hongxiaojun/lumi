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
  let frame = 0
  const read = () => {
    frame = 0
    const sel = doc.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      onSelect(null)
      return
    }
    const clipped = clipRangeToContent(sel.getRangeAt(0).cloneRange())
    onSelect(clipped)
  }
  const onUp = () => {
    read()
    // iOS commits the selection after touchend. One more frame catches it.
    const schedule = doc.defaultView?.requestAnimationFrame?.bind(doc.defaultView)
    if (schedule) schedule(read)
  }
  const onChange = () => {
    // Dragging a selection handle runs outside the chapter: no touchend
    // arrives here, so a long-press alone would keep only its first word.
    const sel = doc.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const schedule = doc.defaultView?.requestAnimationFrame?.bind(doc.defaultView)
    if (!schedule) {
      read()
      return
    }
    if (frame) doc.defaultView?.cancelAnimationFrame?.(frame)
    frame = schedule(read)
  }
  doc.addEventListener('mouseup', onUp)
  doc.addEventListener('touchend', onUp)
  doc.addEventListener('selectionchange', onChange)
  return () => {
    doc.removeEventListener('mouseup', onUp)
    doc.removeEventListener('touchend', onUp)
    doc.removeEventListener('selectionchange', onChange)
    if (frame) doc.defaultView?.cancelAnimationFrame?.(frame)
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return value.replace(/"/g, '\\"')
}
