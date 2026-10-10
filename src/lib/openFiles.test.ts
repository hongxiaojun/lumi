import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const listen = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => listen(...args) }))

import {
  loadOpenedFiles,
  subscribeOpenedFiles,
  takeAndLoadOpenedFiles,
  type PendingOpen,
} from './openFiles'

function setTauri(on: boolean) {
  const w = window as unknown as Record<string, unknown>
  if (on) w.__TAURI_INTERNALS__ = {}
  else delete w.__TAURI_INTERNALS__
}

beforeEach(() => {
  invoke.mockReset()
  listen.mockReset()
  setTauri(false)
})

afterEach(() => setTauri(false))

describe('openFiles (M12-2)', () => {
  it('non-Tauri: take/subscribe do nothing', async () => {
    setTauri(false)
    await expect(takeAndLoadOpenedFiles()).resolves.toEqual({ files: [], errors: [] })
    const un = await subscribeOpenedFiles(() => {})
    expect(listen).not.toHaveBeenCalled()
    un()
  })

  it('pending path: take_pending_opens then read_opened_file once per book', async () => {
    setTauri(true)
    const pending: PendingOpen[] = [
      { token: 't1', name: 'a.epub' },
      { token: 't2', name: 'b.pdf' },
    ]
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd === 'take_pending_opens') return pending
      if (cmd === 'read_opened_file' && args?.token === 't1') return new Uint8Array([1, 2]).buffer
      if (cmd === 'read_opened_file' && args?.token === 't2') return new Uint8Array([3]).buffer
      throw new Error(`unexpected ${cmd}`)
    })
    const { files, errors } = await takeAndLoadOpenedFiles()
    expect(errors).toEqual([])
    expect(files.map((f) => f.name)).toEqual(['a.epub', 'b.pdf'])
    expect(invoke.mock.calls.filter((c) => c[0] === 'read_opened_file')).toHaveLength(2)
    expect(invoke).toHaveBeenCalledWith('take_pending_opens')
  })

  it('event path: open-files listener loads each token once', async () => {
    setTauri(true)
    let handler: ((event: { payload: PendingOpen[] }) => void) | undefined
    listen.mockImplementation(async (_name: string, cb: typeof handler) => {
      handler = cb
      return () => {}
    })
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd === 'read_opened_file' && args?.token === 'ev1') return new Uint8Array([9]).buffer
      throw new Error(`unexpected ${cmd} ${args?.token}`)
    })

    let resolveSeen!: () => void
    const seenDone = new Promise<void>((r) => {
      resolveSeen = r
    })
    const seen: File[] = []
    await subscribeOpenedFiles(async (items) => {
      const { files } = await loadOpenedFiles(items)
      seen.push(...files)
      resolveSeen()
    })
    expect(listen).toHaveBeenCalledWith('open-files', expect.any(Function))
    handler?.({ payload: [{ token: 'ev1', name: 'live.epub' }] })
    await seenDone
    expect(seen).toHaveLength(1)
    expect(seen[0].name).toBe('live.epub')
    expect(invoke.mock.calls.filter((c) => c[0] === 'read_opened_file')).toHaveLength(1)
  })

  it('App order: listen then take_pending reads each token once (no double import)', async () => {
    setTauri(true)
    const pending: PendingOpen[] = [
      { token: 't-a', name: 'a.epub' },
      { token: 't-b', name: 'b.epub' },
    ]
    const readTokens: string[] = []
    listen.mockImplementation(async () => () => {})
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd === 'take_pending_opens') return pending
      if (cmd === 'read_opened_file') {
        readTokens.push(args!.token!)
        return new Uint8Array([1]).buffer
      }
      throw new Error(cmd)
    })

    await subscribeOpenedFiles(async () => {
      throw new Error('cold-start should not rely on late event')
    })
    const drained = await takeAndLoadOpenedFiles()
    expect(drained.files.map((f) => f.name)).toEqual(['a.epub', 'b.epub'])
    expect(readTokens).toEqual(['t-a', 't-b'])
    expect(readTokens).toHaveLength(2)
  })
})
