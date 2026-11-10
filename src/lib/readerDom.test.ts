import { describe, expect, it } from 'vitest'
import { injectTranslations, listenBookSelection, removeTranslations } from './readerDom'
import { extractBlocks } from './translate/blocks'

describe('injectTranslations', () => {
  it('inserts a translation paragraph after each block', () => {
    const doc = new DOMParser().parseFromString(
      '<p>Hello world</p><p>Turn the page.</p>',
      'text/html',
    )
    const blocks = extractBlocks(doc.body)
    const map = new Map([
      [blocks[0].id, '你好，世界'],
      [blocks[1].id, '请翻页。'],
    ])
    expect(injectTranslations(doc, map)).toBe(2)
    const paras = [...doc.querySelectorAll('p')]
    expect(paras).toHaveLength(2)
    expect(paras[0].querySelector('[data-leaf-tr]')?.textContent).toBe('你好，世界')
    expect(paras[1].querySelector('[data-leaf-tr]')?.textContent).toBe('请翻页。')
  })

  it('updates existing translation nodes instead of duplicating', () => {
    const doc = new DOMParser().parseFromString('<p>Hello world</p>', 'text/html')
    const blocks = extractBlocks(doc.body)
    const map = new Map([[blocks[0].id, '你好']])
    injectTranslations(doc, map)
    injectTranslations(doc, new Map([[blocks[0].id, '你好啊']]))
    expect(doc.querySelectorAll('[data-leaf-tr]')).toHaveLength(1)
    expect(doc.querySelector('[data-leaf-tr]')?.textContent).toBe('你好啊')
  })

  it('removes injected nodes', () => {
    const doc = new DOMParser().parseFromString('<p>Hello world</p>', 'text/html')
    const blocks = extractBlocks(doc.body)
    injectTranslations(doc, new Map([[blocks[0].id, '你好']]))
    removeTranslations(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(1)
  })
})

describe('listenBookSelection', () => {
  it('does not insert a menu into the book document', () => {
    const doc = new DOMParser().parseFromString('<p>Hello</p>', 'text/html')
    const stop = listenBookSelection(doc, () => {})
    expect(doc.querySelector('[data-leaf-menu]')).toBeNull()
    stop()
  })

  it('opens the highlight bar when a finger lifts on a selection', async () => {
    const paragraph = document.createElement('p')
    paragraph.textContent = '黛玉便知是他'
    const seen: string[] = []
    const queued: FrameRequestCallback[] = []
    const real = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (fn) => {
      queued.push(fn)
      return queued.length
    }
    const stop = listenBookSelection(document, (info) => seen.push(info?.text ?? ''))
    document.dispatchEvent(new Event('touchend'))
    expect(queued).toHaveLength(1)
    document.body.append(paragraph)
    const live = document.createRange()
    live.setStart(paragraph.firstChild!, 0)
    live.setEnd(paragraph.firstChild!, 2)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(live)
    queued[0](0)
    window.requestAnimationFrame = real
    expect(seen.at(-1)).toBe('黛玉')
    document.getSelection()?.removeAllRanges()
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(seen.at(-1)).toBe('')
    stop()
    paragraph.remove()
  })
})
