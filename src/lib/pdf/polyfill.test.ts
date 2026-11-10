import { afterEach, describe, expect, it, vi } from 'vitest'
import { installStreamAsyncIterator, streamAsyncIterator } from './polyfill'

type Proto = Record<symbol, unknown>

const KEY = Symbol.asyncIterator
const proto = ReadableStream.prototype as Proto
const native = proto[KEY]

afterEach(() => {
  Object.defineProperty(proto, KEY, { configurable: true, writable: true, value: native })
})

function safariLike(): void {
  Reflect.deleteProperty(proto, KEY)
}

function closed(values: number[]): ReadableStream<number> {
  return new ReadableStream<number>({
    start(controller) {
      for (const value of values) controller.enqueue(value)
      controller.close()
    },
  })
}

describe('streamAsyncIterator', () => {
  it('reads every chunk in order', async () => {
    const out: number[] = []
    for await (const value of streamAsyncIterator(closed([1, 2, 3]))) out.push(value)
    expect(out).toEqual([1, 2, 3])
  })

  it('cancels the stream when the loop breaks early', async () => {
    let cancelled = false
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1)
        controller.enqueue(2)
      },
      cancel() {
        cancelled = true
      },
    })
    for await (const value of streamAsyncIterator(stream)) {
      expect(value).toBe(1)
      break
    }
    await Promise.resolve()
    expect(cancelled).toBe(true)
  })
})

describe('installStreamAsyncIterator', () => {
  it('adds async iteration where WebKit has none', async () => {
    safariLike()
    expect(proto[KEY]).toBeUndefined()
    installStreamAsyncIterator(ReadableStream)
    expect(typeof proto[KEY]).toBe('function')
    const out: number[] = []
    for await (const value of closed([7, 8])) out.push(value)
    expect(out).toEqual([7, 8])
  })

  it('keeps the runtime implementation when one exists', () => {
    Object.defineProperty(proto, KEY, { configurable: true, writable: true, value: native ?? function native() {} })
    const before = proto[KEY]
    installStreamAsyncIterator(ReadableStream)
    expect(proto[KEY]).toBe(before)
  })

  it('installs itself on import, so pdf.js sees it before the first page', async () => {
    safariLike()
    vi.resetModules()
    await import('./polyfill')
    expect(typeof (ReadableStream.prototype as Proto)[KEY]).toBe('function')
  })
})
