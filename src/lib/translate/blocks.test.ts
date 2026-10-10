import { describe, expect, it } from 'vitest'
import { extractBlocks, parseHtmlBlocks } from './blocks'

describe('extractBlocks', () => {
  it('pulls paragraphs and headings', () => {
    const blocks = parseHtmlBlocks(`
      <h1>Why a reader</h1>
      <p>A personal reader should disappear.</p>
      <p>  </p>
      <p>Turn the page.</p>
    `)
    expect(blocks.map((b) => b.text)).toEqual([
      'Why a reader',
      'A personal reader should disappear.',
      'Turn the page.',
    ])
    expect(blocks[0].tag).toBe('h1')
  })

  it('skips existing translation nodes', () => {
    const blocks = parseHtmlBlocks(`
      <p>Hello world</p>
      <p class="leaf-tr" data-leaf-tr="1">你好，世界</p>
    `)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Hello world')
  })

  it('assigns stable leaf ids', () => {
    const doc = new DOMParser().parseFromString('<p>One</p><p>Two</p>', 'text/html')
    const first = extractBlocks(doc.body)
    const second = extractBlocks(doc.body)
    expect(first.map((b) => b.id)).toEqual(second.map((b) => b.id))
  })

  it('does not rely on instanceof Element (iframe realm)', () => {
    const doc = new DOMParser().parseFromString('<p>Hello world</p>', 'text/html')
    const p = doc.querySelector('p')
    expect(p?.nodeType).toBe(1)
    expect(extractBlocks(doc.body)[0].text).toBe('Hello world')
  })

  it('reads XHTML paragraphs', () => {
    const doc = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello world</p></body></html>',
      'application/xhtml+xml',
    )
    expect(extractBlocks(doc)).toEqual([
      expect.objectContaining({ text: 'Hello world', tag: 'p' }),
    ])
  })

  it('ignores nested items inside a translation', () => {
    const blocks = parseHtmlBlocks(`<div class="leaf-tr"><p>should skip</p></div><p>keep</p>`)
    expect(blocks.map((b) => b.text)).toEqual(['keep'])
  })
})
