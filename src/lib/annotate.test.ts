import { describe, expect, it } from 'vitest'
import * as CFI from 'foliate-js/epubcfi.js'
import { clipRangeToContent, isDecoratedNode, sectionIndexForRange } from './annotate'
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
