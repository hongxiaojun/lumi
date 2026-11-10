import { describe, expect, it } from 'vitest'
import * as CFI from 'foliate-js/epubcfi.js'
import { clipRangeToContent, isDecoratedNode, placeSelectionBar, sectionIndexForRange } from './annotate'
import { extractBlocks } from './translate/blocks'
import { injectTranslations, removeTranslations } from './readerDom'

function html(source: string): Document {
  return new DOMParser().parseFromString(source, 'text/html')
}

function selectText(el: Element): Range {
  const range = el.ownerDocument.createRange()
  const text = [...el.childNodes].find((n) => n.nodeType === 3)
  if (!text) {
    range.selectNodeContents(el)
    return range
  }
  range.selectNodeContents(text)
  return range
}

describe('clipRangeToContent', () => {
  it('keeps a selection that only covers original text', () => {
    const doc = html('<p>Hello world</p>')
    const range = selectText(doc.querySelector('p')!)
    expect(clipRangeToContent(range)?.text).toBe('Hello world')
  })

  it('drops a selection that only covers the translation', () => {
    const doc = html('<p>Hello world<span data-leaf-tr="1">你好</span></p>')
    const tr = doc.querySelector('[data-leaf-tr]')!
    const range = doc.createRange()
    range.selectNodeContents(tr)
    expect(clipRangeToContent(range)).toBeNull()
  })

  it('clips a selection that spills into the translation back to the original sentence', () => {
    const doc = html('<p>Hello world<span data-leaf-tr="1">你好</span></p>')
    const p = doc.querySelector('p')!
    const range = doc.createRange()
    range.setStart(p.firstChild!, 0)
    range.setEnd(p.querySelector('[data-leaf-tr]')!.firstChild!, 2)
    expect(clipRangeToContent(range)?.text).toBe('Hello world')
  })
})

describe('placeSelectionBar', () => {
  const bar = { width: 238, height: 98 }
  const bound = { width: 402, height: 874 }

  it('sits above the selection on desktop when there is room', () => {
    expect(placeSelectionBar({ top: 300, bottom: 360, center: 200 }, bar, bound)).toEqual({ top: 194, left: 200 })
  })

  it('sits below text in the upper half of a phone page', () => {
    expect(placeSelectionBar(
      { top: 300, bottom: 360, center: 200 }, bar, bound, 8, {}, true,
    )).toEqual({ top: 428, left: 200 })
  })

  it('leaves room below the selection for iOS Copy / Look Up on a phone', () => {
    // The device showed the native menu covering the pen row when the bar sat
    // only one gap below the selection end.
    const placed = placeSelectionBar(
      { top: 300, bottom: 360, center: 200 }, bar, bound, 8, {}, true,
    )
    expect(placed.top).toBeGreaterThanOrEqual(360 + 60)
  })

  it('also sits below text in the lower half when there is room', () => {
    expect(placeSelectionBar(
      { top: 600, bottom: 660, center: 200 }, bar, bound, 8, {}, true,
    )).toEqual({ top: 728, left: 200 })
  })

  it('flips above when the bottom safe area leaves no room', () => {
    const inset = { top: 59, bottom: 34, left: 0, right: 0 }
    expect(placeSelectionBar(
      { top: 700, bottom: 760, center: 200 }, bar, bound, 8, inset, true,
    ).top).toBe(594)
  })

  it('clamps a below placement instead of covering the text', () => {
    const tall = { width: 310, height: 110 }
    const host = { width: 402, height: 778 }
    const inset = { top: 62, bottom: 0, left: 0, right: 0 }
    expect(placeSelectionBar(
      { top: 636, bottom: 669, center: 200 }, tall, host, 8, inset, true,
    ).top).toBe(668)
  })

  it('flips above when the text is too low to clamp below', () => {
    const tall = { width: 310, height: 110 }
    const host = { width: 402, height: 778 }
    const inset = { top: 62, bottom: 0, left: 0, right: 0 }
    expect(placeSelectionBar(
      { top: 700, bottom: 733, center: 200 }, tall, host, 8, inset, true,
    ).top).toBe(582)
  })

  it('flips below the selection when the bar would leave the top', () => {
    expect(placeSelectionBar({ top: 60, bottom: 120, center: 200 }, bar, bound).top).toBe(128)
  })

  it('keeps the bar inside both side margins', () => {
    expect(placeSelectionBar({ top: 300, bottom: 360, center: 10 }, bar, bound).left).toBe(127)
    expect(placeSelectionBar({ top: 300, bottom: 360, center: 400 }, bar, bound).left).toBe(275)
  })

  it('centres a bar wider than the reader', () => {
    const wide = { width: 420, height: 98 }
    expect(placeSelectionBar({ top: 300, bottom: 360, center: 200 }, wide, bound).left).toBe(201)
  })

  it('flips below when the safe area leaves no room above', () => {
    const inset = { top: 59, bottom: 34, left: 0, right: 0 }
    expect(placeSelectionBar({ top: 140, bottom: 200, center: 200 }, bar, bound, 8, inset).top).toBe(208)
  })

  it('treats the safe area as unreachable space', () => {
    const inset = { top: 59, bottom: 34, left: 0, right: 0 }
    const nearTop = placeSelectionBar({ top: 140, bottom: 200, center: 200 }, bar, bound, 8, inset)
    expect(nearTop.top).toBe(208)
    const low = placeSelectionBar({ top: 700, bottom: 760, center: 200 }, bar, bound, 8, inset)
    expect(low.top).toBe(594)
    expect(low.top + bar.height).toBeLessThanOrEqual(bound.height - inset.bottom)
  })

  it('clamps above the safe-area edge when neither side fits', () => {
    const inset = { top: 59, bottom: 34, left: 0, right: 0 }
    const top = placeSelectionBar({ top: 120, bottom: 800, center: 200 }, bar, bound, 8, inset).top
    expect(top).toBe(67)
  })

  it('keeps the bar inside side safe areas', () => {
    const inset = { top: 0, bottom: 0, left: 44, right: 44 }
    expect(placeSelectionBar({ top: 300, bottom: 360, center: 10 }, bar, bound, 8, inset).left).toBe(171)
    expect(placeSelectionBar({ top: 300, bottom: 360, center: 400 }, bar, bound, 8, inset).left).toBe(231)
  })
})

describe('sectionIndexForRange', () => {
  it('uses the document that owns the range, not contents[0]', () => {
    const a = html('<p>A</p>')
    const b = html('<p>B</p>')
    const range = selectText(b.querySelector('p')!)
    expect(sectionIndexForRange([{ doc: a, index: 0 }, { doc: b, index: 4 }], range)).toBe(4)
  })

  it('returns null when the range is not in a loaded section', () => {
    const doc = html('<p>A</p>')
    const other = html('<p>B</p>')
    const range = selectText(other.querySelector('p')!)
    expect(sectionIndexForRange([{ doc, index: 0 }], range)).toBeNull()
  })
})

describe('highlight CFI stays on the selected sentence', () => {
  it('does not move after injecting a translation into the same paragraph', () => {
    const doc = html('<p>Hello world</p><p>Turn the page.</p>')
    const first = doc.querySelector('p')!
    const before = CFI.fromRange(selectText(first))
    const blocks = extractBlocks(doc.body)
    injectTranslations(doc, new Map([[blocks[0].id, '你好，世界']]))
    const after = CFI.fromRange(selectText(first))
    expect(after).toBe(before)
    expect(first.textContent).toContain('Hello world')
    expect(first.querySelector('[data-leaf-tr]')?.textContent).toBe('你好，世界')
  })

  it('does not move the second paragraph when the first gets a translation', () => {
    const doc = html('<p>Hello world</p><p>Turn the page.</p>')
    const second = doc.querySelectorAll('p')[1]
    const before = CFI.fromRange(selectText(second))
    const blocks = extractBlocks(doc.body)
    injectTranslations(doc, new Map([[blocks[0].id, '你好，世界']]))
    expect(CFI.fromRange(selectText(second))).toBe(before)
  })

  it('still resolves after translations are removed', () => {
    const doc = html('<p>Hello world</p>')
    const p = doc.querySelector('p')!
    const before = CFI.fromRange(selectText(p))
    const blocks = extractBlocks(doc.body)
    injectTranslations(doc, new Map([[blocks[0].id, '你好']]))
    removeTranslations(doc)
    expect(CFI.fromRange(selectText(p))).toBe(before)
  })

  it('does not treat translation text as original when extracting blocks again', () => {
    const doc = html('<p>Hello world</p>')
    const once = extractBlocks(doc.body)
    injectTranslations(doc, new Map([[once[0].id, '你好，世界']]))
    const twice = extractBlocks(doc.body)
    expect(twice[0].text).toBe('Hello world')
  })
})

describe('isDecoratedNode', () => {
  it('marks translation nodes so they are not stored as quotes', () => {
    const doc = html('<p>Hello<span data-leaf-tr="1">你好</span></p>')
    expect(isDecoratedNode(doc.querySelector('[data-leaf-tr]')!)).toBe(true)
    expect(isDecoratedNode(doc.querySelector('p')!.firstChild!)).toBe(false)
  })
})
