import { describe, expect, it, vi } from 'vitest'
import { createChapterPrefetcher, shouldPrefetchNextChapter } from './chapterPrefetch'

describe('shouldPrefetchNextChapter', () => {
  it('fires on the last two sentences of a chapter', () => {
    expect(shouldPrefetchNextChapter(6, 9)).toBe(false)
    expect(shouldPrefetchNextChapter(7, 9)).toBe(true)
    expect(shouldPrefetchNextChapter(8, 9)).toBe(true)
  })

  it('handles short chapters', () => {
    expect(shouldPrefetchNextChapter(0, 1)).toBe(true)
    expect(shouldPrefetchNextChapter(0, 2)).toBe(true)
    expect(shouldPrefetchNextChapter(1, 2)).toBe(true)
    expect(shouldPrefetchNextChapter(0, 0)).toBe(false)
  })
})

describe('createChapterPrefetcher', () => {
  const units = ['下一章甲句。', '下一章乙句。', '下一章丙句。']

  it('peeks once per chapter and prefetches only the first sentences', async () => {
    const peek = vi.fn(async () => units)
    const prefetch = vi.fn()
    const once = createChapterPrefetcher(peek, prefetch)

    once.maybe(6, 9)
    expect(peek).not.toHaveBeenCalled()
    once.maybe(7, 9)
    await vi.waitFor(() => expect(prefetch).toHaveBeenCalledWith(['下一章甲句。', '下一章乙句。']))
    expect(peek).toHaveBeenCalledTimes(1)

    // Later sentence turns must not peek or prefetch again.
    once.maybe(8, 9)
    expect(peek).toHaveBeenCalledTimes(1)
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('swallows a failed peek without touching the prefetcher', async () => {
    const peek = vi.fn(async () => {
      throw new Error('下一章打不开')
    })
    const prefetch = vi.fn()
    const once = createChapterPrefetcher(peek, prefetch)

    once.maybe(7, 9)
    await vi.waitFor(() => expect(peek).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(prefetch).not.toHaveBeenCalled()
  })

  it('does nothing when the peek finds no next chapter', async () => {
    const peek = vi.fn(async () => null)
    const prefetch = vi.fn()
    const once = createChapterPrefetcher(peek, prefetch)

    once.maybe(8, 9)
    await vi.waitFor(() => expect(peek).toHaveBeenCalledTimes(1))
    expect(prefetch).not.toHaveBeenCalled()
  })
})
