import { describe, expect, it } from 'vitest'

// jsdom has no layout observers. The paginator reads them while it is created.
function installLayoutShims() {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    })) as typeof window.matchMedia
  }
}

type PaginatorEl = HTMLElement & {
  open(book: { dir: string; sections: unknown[] }): void
  destroy(): void
}

describe('paginator closed before the first page', () => {
  it('does not throw when no page view exists yet', async () => {
    installLayoutShims()
    await import('foliate-js/paginator.js')
    const page = document.createElement('foliate-paginator') as PaginatorEl
    document.body.append(page)
    try {
      page.open({ dir: 'ltr', sections: [] })
      expect(() => page.destroy()).not.toThrow()
      expect(() => page.destroy()).not.toThrow()
    } finally {
      page.remove()
    }
  })
})
