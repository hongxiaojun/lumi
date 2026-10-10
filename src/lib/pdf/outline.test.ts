import { describe, expect, it } from 'vitest'
import { outlineFromPdf } from './outline'

describe('outlineFromPdf', () => {
  it('collects page indices and titles from a nested outline', async () => {
    const pdf = {
      getOutline: async () => [
        { title: '封面', dest: 'cover', items: [] },
        {
          title: '第一部',
          dest: ['p3'],
          items: [{ title: '第一章', dest: ['p4'], items: [] }],
        },
      ],
      getDestination: async (name: string) => (name === 'cover' ? ['p0'] : null),
      getPageIndex: async (ref: unknown) => {
        if (ref === 'p0') return 0
        if (ref === 'p3') return 3
        if (ref === 'p4') return 4
        return -1
      },
    }
    const outline = await outlineFromPdf(pdf)
    expect(outline).toEqual([
      { pageIndex: 0, title: '封面' },
      { pageIndex: 3, title: '第一部' },
      { pageIndex: 4, title: '第一章' },
    ])
  })
})
