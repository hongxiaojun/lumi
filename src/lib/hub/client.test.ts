import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeHub } from './client'

function health(body: string, status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
}

describe('probeHub', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts only the hub health JSON', async () => {
    health(JSON.stringify({ ok: true }))
    expect(await probeHub()).toBe(true)
  })

  it('rejects a 200 HTML page from the packaged asset server', async () => {
    health('<!doctype html><html><body>Lumi</body></html>')
    expect(await probeHub()).toBe(false)
  })

  it('rejects an unhealthy or missing hub', async () => {
    health(JSON.stringify({ ok: false }))
    expect(await probeHub()).toBe(false)
    health('not found', 404)
    expect(await probeHub()).toBe(false)
  })

  it('rejects a hub that cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Load failed')
    }))
    expect(await probeHub()).toBe(false)
  })
})
