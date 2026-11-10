const math = Math as typeof Math & { sumPrecise?: (values: Iterable<number>) => number }

if (typeof math.sumPrecise !== 'function') {
  math.sumPrecise = (values) => {
    let total = 0
    for (const n of values) total += n
    return total
  }
}

/** One async iterator over a stream, built from getReader() so it does not
 * depend on the runtime having Symbol.asyncIterator on ReadableStream. */
export function streamAsyncIterator<T>(stream: ReadableStream<T>): AsyncIterableIterator<T> {
  const reader = stream.getReader()
  const iterator: AsyncIterableIterator<T> = {
    next: () => reader.read(),
    async return(value?: unknown) {
      try {
        await reader.cancel(value)
      } catch {
        // An errored or already-cancelled stream has nothing left to stop.
      }
      return { done: true, value: value as T }
    },
    [Symbol.asyncIterator]() {
      return iterator
    },
  }
  return iterator
}

/** WebKit shipped no Symbol.asyncIterator on ReadableStream (Safari 26 still
 * lacks it), and pdf.js consumes text content with `for await`. On iOS that
 * throws "undefined is not a function" on the first page, so every PDF import
 * fails. Chrome, Firefox and Node already have it; there the patch is a no-op. */
export function installStreamAsyncIterator(streams: { prototype: object }): void {
  const proto = streams.prototype as Record<symbol, unknown>
  if (typeof proto[Symbol.asyncIterator] === 'function') return
  Object.defineProperty(proto, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: function (this: ReadableStream): AsyncIterableIterator<unknown> {
      return streamAsyncIterator(this)
    },
  })
}

if (typeof ReadableStream !== 'undefined') installStreamAsyncIterator(ReadableStream)
