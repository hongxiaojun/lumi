import { describe, expect, it } from 'vitest'
import * as CFI from 'foliate-js/epubcfi.js'
import { contextForRange, locateQuote, occursVerbatim, resolveHighlight } from './anchor'

function html(source: string): Document {
  return new DOMParser().parseFromString(source, 'text/html')
}

function rangeOf(el: Element, start: number, end: number): Range {
  const text = [...el.childNodes].find((node) => node.nodeType === 3)
  const range = el.ownerDocument.createRange()
  if (!text) {
    range.selectNodeContents(el)
    return range
  }
  range.setStart(text, start)
  range.setEnd(text, end)
  return range
}

const SENTENCE = 'The unit was never the job'

describe('locateQuote', () => {
  const source = `Before. ${SENTENCE}. After the turn. ${SENTENCE}. Tail.`

  it('anchors one occurrence', () => {
    expect(locateQuote('Hello world', { exact: 'world' })).toBe('anchored')
  })

  it('uses the prefix to pick the later copy', () => {
    expect(locateQuote(source, { exact: SENTENCE, prefix: 'After the turn. ' })).toBe('anchored')
  })

  it('does not guess when the same sentence occurs twice', () => {
    expect(locateQuote(source, { exact: SENTENCE })).toBe('ambiguous')
  })

  it('orphans a sentence that is not in the text', () => {
    expect(locateQuote(source, { exact: '这本书主张努力' })).toBe('orphan')
  })

  it('folds whitespace and curly quotes', () => {
    expect(locateQuote('He  said \u201cHello\u201d\nthere', { exact: 'said "Hello" there' })).toBe('anchored')
  })

  it('keeps a Chinese sentence intact', () => {
    expect(locateQuote('第一段。划线必须钉在原句。第二段。', { exact: '划线必须钉在原句' })).toBe('anchored')
  })
})

describe('occursVerbatim', () => {
  it('rejects a claim that was not copied from the chapter', () => {
    expect(occursVerbatim('The unit was never the job.', '这本书主张努力')).toBe(false)
  })

  it('accepts a slice of the chapter, including a cut ending', () => {
    const chapter = 'The unit was never the job that paid the bills.'
    expect(occursVerbatim(chapter, chapter.slice(0, 20))).toBe(true)
  })
})

describe('contextForRange', () => {
  it('takes the surrounding words and skips a translation', () => {
    const doc = html('<p>Before the mark. The unit was never the job. After the turn.</p>')
    const p = doc.querySelector('p')!
    const text = p.firstChild!
    const start = (text.textContent ?? '').indexOf(SENTENCE)
    const range = rangeOf(p, start, start + SENTENCE.length)
    const tr = doc.createElement('span')
    tr.setAttribute('data-leaf-tr', '1')
    tr.textContent = '单元从来不是工作'
    p.append(tr)
    const around = contextForRange(p, range, 12)
    expect(around.prefix.endsWith('mark. ')).toBe(true)
    expect(around.suffix.startsWith('. After')).toBe(true)
    expect(around.prefix + around.suffix).not.toMatch(/单元/)
  })
})

describe('resolveHighlight', () => {
  it('keeps the cfi when the sentence is still there', () => {
    const doc = html(`<p>Before. ${SENTENCE}. After.</p>`)
    const p = doc.querySelector('p')!
    const text = p.firstChild!
    const start = (text.textContent ?? '').indexOf(SENTENCE)
    const range = rangeOf(p, start, start + SENTENCE.length)
    const cfi = CFI.fromRange(range)
    const hit = resolveHighlight(doc, { cfi, text: SENTENCE, prefix: 'Before. ', suffix: '. After' })
    expect(hit).toEqual({ status: 'anchored', cfi, moved: false })
  })

  it('moves the cfi when the sentence survives but the old position does not', () => {
    const doc = html(`<p>Before. ${SENTENCE}. After.</p>`)
    const p = doc.querySelector('p')!
    const text = p.firstChild!
    const start = (text.textContent ?? '').indexOf(SENTENCE)
    const range = rangeOf(p, start, start + SENTENCE.length)
    const cfi = CFI.fromRange(range)
    text.textContent = `Preface. Before. ${SENTENCE}. After.`
    const hit = resolveHighlight(doc, { cfi, text: SENTENCE, prefix: 'Before. ', suffix: '. After' })
    expect(hit.status).toBe('anchored')
    if (hit.status !== 'anchored') return
    expect(hit.moved).toBe(true)
    expect(CFI.toRange(doc, CFI.parse(hit.cfi)).toString()).toBe(SENTENCE)
  })

  it('orphans a sentence deleted from this chapter', () => {
    const doc = html('<p>Before. The unit was never the job. After.</p>')
    const p = doc.querySelector('p')!
    const text = p.firstChild!
    const start = (text.textContent ?? '').indexOf(SENTENCE)
    const cfi = CFI.fromRange(rangeOf(p, start, start + SENTENCE.length))
    text.textContent = 'Before. Gone. After.'
    expect(resolveHighlight(doc, { cfi, text: SENTENCE, prefix: 'Before. ', suffix: '. After' }).status).toBe('orphan')
  })

  it('does not search a different chapter', () => {
    const home = html(`<p>${SENTENCE}.</p>`)
    const p = home.querySelector('p')!
    const local = CFI.fromRange(rangeOf(p, 0, SENTENCE.length))
    const cfi = CFI.joinIndir(CFI.fake.fromIndex(2), local)
    const other = html(`<p>Before. ${SENTENCE}. After.</p>`)
    expect(resolveHighlight(other, { cfi, text: SENTENCE, prefix: 'Before. ', suffix: '. After' }, 0).status).toBe(
      'elsewhere',
    )
  })
})
