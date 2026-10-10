import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const listen = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => listen(...args) }))

import {
  formatUnsupportedTip,
  loadOpenedFiles,
  subscribeOpenedFiles,
  subscribeRejectedOpens,
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
  it('cold start: pending imported once via take_pending_opens', async () => {
    setTauri(true)
    let pending: PendingOpen[] = [{ token: 'c1', name: 'cold.epub' }]
    const reads: string[] = []
    listen.mockImplementation(async () => () => {})
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd === 'take_pending_opens') {
        const out = pending
        pending = []
        return out
      }
      if (cmd === 'read_opened_file') {
        reads.push(args!.token!)
        return new Uint8Array([1]).buffer
      }
      throw new Error(cmd)
    })
    await subscribeOpenedFiles(() => {})
    const first = await takeAndLoadOpenedFiles()
    expect(first.files.map((f) => f.name)).toEqual(['cold.epub'])
    expect(reads).toEqual(['c1'])
  })

  it('hot open: only event path imports, take_pending stays empty', async () => {
    setTauri(true)
    let handler: ((event: { payload: PendingOpen[] }) => void) | undefined
    listen.mockImplementation(async (_n: string, cb: typeof handler) => {
      handler = cb
      return () => {}
    })
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd === 'take_pending_opens') return []
      if (cmd === 'read_opened_file' && args?.token === 'h1') return new Uint8Array([2]).buffer
      throw new Error(`${cmd} ${args?.token}`)
    })
    let done!: () => void
    const finished = new Promise<void>((r) => (done = r))
    const viaEvent: string[] = []
    await subscribeOpenedFiles(async (items) => {
      const { files } = await loadOpenedFiles(items)
      viaEvent.push(...files.map((f) => f.name))
      done()
    })
    const drained = await takeAndLoadOpenedFiles()
    expect(drained.files).toEqual([])
    handler?.({ payload: [{ token: 'h1', name: 'hot.pdf' }] })
    await finished
    expect(viaEvent).toEqual(['hot.pdf'])
    expect(invoke.mock.calls.filter((c) => c[0] === 'read_opened_file')).toHaveLength(1)
  })

  it('remount: second take_pending does not re-import', async () => {
    setTauri(true)
    let pending: PendingOpen[] = [{ token: 'r1', name: 'once.epub' }]
    const reads: string[] = []
    listen.mockImplementation(async () => () => {})
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd === 'take_pending_opens') {
        const out = pending
        pending = []
        return out
      }
      if (cmd === 'read_opened_file') {
        reads.push(args!.token!)
        return new Uint8Array([1]).buffer
      }
      throw new Error(cmd)
    })
    const a = await takeAndLoadOpenedFiles()
    const b = await takeAndLoadOpenedFiles()
    expect(a.files).toHaveLength(1)
    expect(b.files).toHaveLength(0)
    expect(reads).toEqual(['r1'])
  })

  it('unknown token is skipped silently (no error), other errors still reported', async () => {
    setTauri(true)
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd !== 'read_opened_file') throw new Error(cmd)
      if (args?.token === 'gone') throw 'unknown open token'
      if (args?.token === 'big') throw 'file too large: 600 bytes (max 512MB)'
      return new Uint8Array([1]).buffer
    })
    const { files, errors } = await loadOpenedFiles([
      { token: 'gone', name: 'gone.epub' },
      { token: 'ok', name: 'ok.epub' },
      { token: 'big', name: 'big.pdf' },
    ])
    expect(files.map((f) => f.name)).toEqual(['ok.epub'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('big.pdf')
    expect(errors.join('\n')).not.toContain('gone.epub')
  })
  it('drag/open-files path: event batch imports via loadOpenedFiles', async () => {
    setTauri(true)
    let handler: ((event: { payload: PendingOpen[] }) => void) | undefined
    listen.mockImplementation(async (name: string, cb: typeof handler) => {
      if (name === 'open-files') handler = cb
      return () => {}
    })
    invoke.mockImplementation(async (cmd: string, args?: { token?: string }) => {
      if (cmd === 'read_opened_file' && args?.token === 'd1') return new Uint8Array([4]).buffer
      throw new Error(cmd)
    })
    let done!: () => void
    const finished = new Promise<void>((r) => (done = r))
    const names: string[] = []
    await subscribeOpenedFiles(async (items) => {
      const { files } = await loadOpenedFiles(items)
      names.push(...files.map((f) => f.name))
      done()
    })
    handler?.({ payload: [{ token: 'd1', name: 'drop.epub' }] })
    await finished
    expect(names).toEqual(['drop.epub'])
  })

  it('rejected opens show 不支持的格式 tip (not silent)', async () => {
    setTauri(true)
    let handler: ((event: { payload: string[] }) => void) | undefined
    listen.mockImplementation(async (name: string, cb: (e: { payload: string[] }) => void) => {
      if (name === 'open-files-rejected') handler = cb
      return () => {}
    })
    let tip = ''
    let done!: () => void
    const finished = new Promise<void>((r) => (done = r))
    await subscribeRejectedOpens((names) => {
      tip = formatUnsupportedTip(names)
      done()
    })
    handler?.({ payload: ['notes.txt', 'photo.png'] })
    await finished
    expect(tip).toBe('不支持的格式：notes.txt、photo.png')
  })
})
