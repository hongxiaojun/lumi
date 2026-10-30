import { describe, expect, it } from 'vitest'
import { blobFromIpc, BOOK_FETCH_CHUNK, BOOK_READ_CHUNK, ipcBytes, readBookChunks, readBookUrl } from './ipcBytes'

describe('ipcBytes', () => {
  it('keeps an ArrayBuffer as those bytes', () => {
    const bytes = ipcBytes(new Uint8Array([80, 75, 3, 4]).buffer)
    expect(Array.from(bytes)).toEqual([80, 75, 3, 4])
  })

  it('keeps a Uint8Array as those bytes', () => {
    expect(Array.from(ipcBytes(new Uint8Array([1, 2])))).toEqual([1, 2])
  })

  it('turns a macOS Tauri number array into bytes, not a comma-separated string', async () => {
    const blob = blobFromIpc([80, 75, 3, 4])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes)).toEqual([80, 75, 3, 4])
    expect(blob.size).toBe(4)
    const text = new TextDecoder().decode(bytes)
    expect(text).not.toContain(',')
  })

  it('joins macOS chunks into one file and stops at a short read', async () => {
    const calls: Array<{ offset: number; length: number }> = []
    const bytes = await readBookChunks(async (offset, length) => {
      calls.push({ offset, length })
      expect(length).toBe(BOOK_READ_CHUNK)
      if (offset === 0) return new Array(BOOK_READ_CHUNK).fill(7)
      if (offset === BOOK_READ_CHUNK) return [8, 9]
      return []
    })
    expect(calls).toEqual([
      { offset: 0, length: BOOK_READ_CHUNK },
      { offset: BOOK_READ_CHUNK, length: BOOK_READ_CHUNK },
    ])
    expect(bytes.length).toBe(BOOK_READ_CHUNK + 2)
    expect(bytes[0]).toBe(7)
    expect(bytes[BOOK_READ_CHUNK]).toBe(8)
    expect(bytes[BOOK_READ_CHUNK + 1]).toBe(9)
  })

  it('keeps the first chunk when the next read overwrites that ArrayBuffer', async () => {
    const shared = new Uint8Array(BOOK_READ_CHUNK)
    shared.fill(7)
    const bytes = await readBookChunks(async (offset) => {
      if (offset === 0) return shared.buffer
      shared.fill(8)
      return new Uint8Array([8, 9]).buffer
    })
    expect(bytes[0]).toBe(7)
    expect(bytes[BOOK_READ_CHUNK]).toBe(8)
    expect(bytes[BOOK_READ_CHUNK + 1]).toBe(9)
    expect(bytes.length).toBe(BOOK_READ_CHUNK + 2)
  })

  it('joins leafbook ranges and copies each body before the buffer is reused', async () => {
    const shared = new ArrayBuffer(BOOK_FETCH_CHUNK)
    new Uint8Array(shared).fill(7)
    let calls = 0
    const bytes = await readBookUrl('leafbook://localhost/book-1.epub', async (_url, init) => {
      calls += 1
      expect(init.headers.Range).toBe(
        calls === 1 ? `bytes=0-${BOOK_FETCH_CHUNK - 1}` : `bytes=${BOOK_FETCH_CHUNK}-${BOOK_FETCH_CHUNK * 2 - 1}`,
      )
      if (calls === 1) {
        return {
          status: 206,
          headers: { get: () => `bytes 0-${BOOK_FETCH_CHUNK - 1}/${BOOK_FETCH_CHUNK + 2}` },
          arrayBuffer: async () => shared,
        }
      }
      new Uint8Array(shared).fill(8)
      const tail = new Uint8Array([8, 9])
      return {
        status: 206,
        headers: { get: () => `bytes ${BOOK_FETCH_CHUNK}-${BOOK_FETCH_CHUNK + 1}/${BOOK_FETCH_CHUNK + 2}` },
        arrayBuffer: async () => tail.buffer,
      }
    })
    expect(bytes.length).toBe(BOOK_FETCH_CHUNK + 2)
    expect(bytes[0]).toBe(7)
    expect(bytes[BOOK_FETCH_CHUNK]).toBe(8)
    expect(bytes[BOOK_FETCH_CHUNK + 1]).toBe(9)
  })

  it('throws 这本书打不开 when the pieces are shorter than Content-Range', async () => {
    let calls = 0
    await expect(
      readBookUrl('leafbook://localhost/a.epub', async () => {
        calls += 1
        if (calls === 1) {
          return {
            status: 206,
            headers: { get: () => 'bytes 0-1/4' },
            arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
          }
        }
        if (calls === 2) {
          return {
            status: 206,
            headers: { get: () => 'bytes 2-2/4' },
            arrayBuffer: async () => new Uint8Array([3]).buffer,
          }
        }
        return {
          status: 206,
          headers: { get: () => 'bytes */4' },
          arrayBuffer: async () => new ArrayBuffer(0),
        }
      }),
    ).rejects.toThrow('这本书打不开')
  })

  it('returns an empty file when the range says the book has no bytes', async () => {
    const bytes = await readBookUrl('leafbook://localhost/empty.epub', async () => ({
      status: 416,
      headers: { get: () => 'bytes */0' },
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
    expect(bytes.length).toBe(0)
  })

  it('rejects a payload that is not file bytes', () => {
    expect(() => ipcBytes('PK')).toThrow('这本书打不开')
    expect(() => ipcBytes([80, 256])).toThrow('这本书打不开')
    expect(() => ipcBytes(null)).toThrow('这本书打不开')
  })
})
