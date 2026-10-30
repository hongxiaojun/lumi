const FAIL = '这本书打不开'

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

/** Tauri on macOS returns raw command bytes as a JSON number array, not an ArrayBuffer. */
export function ipcBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return copyBytes(data)
  if (data instanceof ArrayBuffer) return copyBytes(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) {
    return copyBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  }
  if (!Array.isArray(data)) throw new Error(FAIL)
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i += 1) {
    const n = data[i]
    if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(FAIL)
    out[i] = n
  }
  return out
}

export function ipcBuffer(data: unknown): ArrayBuffer {
  const bytes = ipcBytes(data)
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export function blobFromIpc(data: unknown): Blob {
  return new Blob([ipcBuffer(data)])
}

/** macOS evaluates each IPC reply as one script. One whole book does not fit. */
export const BOOK_READ_CHUNK = 128 * 1024

/** One leafbook response. Larger than the IPC script window, still short of a whole book. */
export const BOOK_FETCH_CHUNK = 512 * 1024

const READ_CEILING = 512 * 1024 * 1024

type RangeResponse = {
  status: number
  headers: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
}

type RangeFetch = (url: string, init: { headers: { Range: string } }) => Promise<RangeResponse>

function rangeOf(header: string | null): { start: number; end: number; total: number } | null {
  if (!header) return null
  const full = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(header)
  if (full) return { start: Number(full[1]), end: Number(full[2]), total: Number(full[3]) }
  const unknown = /bytes\s+\*\/(\d+)/i.exec(header)
  if (unknown) return { start: 0, end: -1, total: Number(unknown[1]) }
  return null
}

/** Read a book from `leafbook://localhost/<id>.<ext>` in ranged responses. */
export async function readBookUrl(url: string, fetchImpl: RangeFetch = fetch): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  let offset = 0
  let total: number | null = null
  for (;;) {
    if (offset > READ_CEILING) throw new Error(FAIL)
    const res = await fetchImpl(url, {
      headers: { Range: `bytes=${offset}-${offset + BOOK_FETCH_CHUNK - 1}` },
    })
    const range = rangeOf(res.headers.get('content-range'))
    if (range) total = range.total
    if (res.status === 416 && total === 0) return new Uint8Array(0)
    if (res.status !== 200 && res.status !== 206) throw new Error(FAIL)
    const chunk = copyBytes(new Uint8Array(await res.arrayBuffer()))
    if (chunk.byteLength === 0) break
    parts.push(chunk)
    const next = range && range.end >= range.start ? range.end + 1 : offset + chunk.byteLength
    if (next <= offset) throw new Error(FAIL)
    offset = next
    if (res.status === 200) break
    if (total != null && offset >= total) break
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  if (total != null && out.length !== total) throw new Error(FAIL)
  return out
}

export async function readBookChunks(
  read: (offset: number, length: number) => Promise<unknown>,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  let offset = 0
  let total = 0
  for (;;) {
    if (offset > READ_CEILING) throw new Error(FAIL)
    const chunk = ipcBytes(await read(offset, BOOK_READ_CHUNK))
    if (chunk.byteLength === 0) break
    parts.push(chunk)
    total += chunk.byteLength
    offset += chunk.byteLength
    if (chunk.byteLength < BOOK_READ_CHUNK) break
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}
