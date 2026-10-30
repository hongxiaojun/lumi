export type JpegSource = {
  width: number
  height: number
  bytes: Uint8Array
  used?: boolean
}

export type PdfFigure = {
  top: number
  name: string
  bytes: Uint8Array
}

const SAVE = 10
const RESTORE = 11
const TRANSFORM = 12
const PAINT = 85
const MIN_SIDE = 24

export function jpegSources(pdf: Uint8Array): JpegSource[] {
  const mark = ascii('DCTDecode')
  const found: JpegSource[] = []
  let from = 0
  while (from < pdf.length) {
    const at = findBytes(pdf, mark, from)
    if (at < 0) break
    from = at + mark.length
    const dictStart = rfind(pdf, ascii('<<'), at, 600)
    const streamAt = findBytes(pdf, ascii('stream'), at)
    if (dictStart < 0 || streamAt < 0 || streamAt - at > 800) continue
    const dict = latin1(pdf.subarray(dictStart, streamAt))
    if (!/\/Subtype\s*\/Image/.test(dict)) continue
    const width = field(dict, 'Width')
    const height = field(dict, 'Height')
    const length = field(dict, 'Length')
    if (!width || !height || !length) continue
    let dataAt = streamAt + 6
    if (pdf[dataAt] === 0x0d) dataAt += 1
    if (pdf[dataAt] === 0x0a) dataAt += 1
    if (dataAt + length > pdf.length) continue
    const bytes = pdf.slice(dataAt, dataAt + length)
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) continue
    found.push({ width, height, bytes })
  }
  return found
}

export function figureBox(ctm: number[]): { top: number; w: number; h: number } {
  const [a, b, c, d, e, f] = ctm
  const xs = [e, e + a, e + c, e + a + c]
  const ys = [f, f + b, f + d, f + b + d]
  const top = Math.max(...ys)
  return { top, w: Math.max(...xs) - Math.min(...xs), h: top - Math.min(...ys) }
}

export function figuresFromOps(
  fnArray: number[],
  argsArray: unknown[][],
  lookup: (name: string) => { width: number; height: number } | null,
  pool: JpegSource[],
  pageIndex: number,
): PdfFigure[] {
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  const out: PdfFigure[] = []
  let n = 0
  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i]
    const args = argsArray[i] ?? []
    if (fn === SAVE) stack.push(ctm.slice())
    else if (fn === RESTORE) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (fn === TRANSFORM) ctm = multiply(ctm, args as number[])
    else if (fn === PAINT) {
      const size = lookup(String(args[0] ?? ''))
      if (!size) continue
      const bytes = claim(pool, size.width, size.height)
      const box = figureBox(ctm)
      if (!bytes || box.w < MIN_SIDE || box.h < MIN_SIDE) continue
      n += 1
      out.push({
        top: box.top,
        name: `img/p${String(pageIndex + 1).padStart(3, '0')}-${n}.jpg`,
        bytes,
      })
    }
  }
  return out
}

function claim(pool: JpegSource[], width: number, height: number): Uint8Array | null {
  const fresh = pool.find((item) => !item.used && item.width === width && item.height === height)
  if (fresh) {
    fresh.used = true
    return fresh.bytes
  }
  return pool.find((item) => item.width === width && item.height === height)?.bytes ?? null
}

function multiply(m: number[], n: number[]): number[] {
  const [a, b, c, d, e, f] = m
  const [a2, b2, c2, d2, e2, f2] = n
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ]
}

function field(dict: string, name: string): number {
  const matched = dict.match(new RegExp(`/${name}\\s+(\\d+)`))
  return matched ? Number(matched[1]) : 0
}

function ascii(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0))
}

function latin1(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

function findBytes(hay: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

function rfind(hay: Uint8Array, needle: number[], before: number, window: number): number {
  const start = Math.max(0, before - window)
  let found = -1
  for (let i = start; i <= before - needle.length; i += 1) {
    let ok = true
    for (let j = 0; j < needle.length; j += 1) if (hay[i + j] !== needle[j]) ok = false
    if (ok) found = i
  }
  return found
}
