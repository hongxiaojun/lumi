import { describe, expect, it } from 'vitest'
import { LOCKED_VIEWPORT, lockDocumentScale } from './lockScale'

describe('lockDocumentScale', () => {
  it('replaces a book viewport and refuses gesture zoom', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><meta name="viewport" content="width=1200"></head><body><p>正文</p></body></html>',
      'text/html',
    )
    lockDocumentScale(doc)
    const metas = [...doc.head.querySelectorAll('meta')].filter((node) => node.getAttribute('name') === 'viewport')
    expect(metas).toHaveLength(1)
    expect(metas[0]?.getAttribute('content')).toBe(LOCKED_VIEWPORT)
    expect(doc.documentElement.style.getPropertyValue('touch-action')).toBe('pan-x pan-y')
    expect(doc.documentElement.style.getPropertyPriority('-webkit-text-size-adjust')).toBe('important')
    const event = new Event('gesturestart', { cancelable: true })
    doc.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
