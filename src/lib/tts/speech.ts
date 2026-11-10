import type { ReadAloudBlock } from '../readAloud'

/** One spoken sentence. `start` is the offset inside the normalized block text. */
export type SpeechUnit = {
  blockIndex: number
  text: string
  start: number
  /** Which identical sentence this is inside the block, so the highlight can pick the right one. */
  occurrence: number
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4'])
const ENDERS = new Set(['。', '！', '？', '!', '?'])
const CLOSERS = new Set(['”', '’', '」', '』', '）', ')', '】', ']', '》', '〉', '…'])
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co',
  'fig', 'no', 'vol', 'ed', 'al', 'e.g', 'i.e', 'u.s', 'u.k', 'a.m', 'p.m',
])
const SOFT_BREAKS = new Set(['，', ',', '；', ';', '：', ':'])
const MAX_UNIT = 220

export function speechUnits(blocks: readonly ReadAloudBlock[]): SpeechUnit[] {
  const units: SpeechUnit[] = []
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]
    if (!block.text) continue
    const seen = new Map<string, number>()
    const heading = HEADINGS.has(block.tag)
    for (const piece of splitSpeech(block.text, heading)) {
      const text = piece.text
      if (!text) continue
      const start = piece.start
      const occurrence = seen.get(text) ?? 0
      seen.set(text, occurrence + 1)
      units.push({ blockIndex, text, start, occurrence })
    }
  }
  return units
}

export function splitSpeech(text: string, heading = false): { text: string; start: number }[] {
  if (!text) return []
  if (heading) {
    const trimmed = text.trim()
    if (!trimmed) return []
    return [{ text: trimmed, start: text.length - text.trimStart().length }]
  }
  const first = scanSentences(text)
  const out: { text: string; start: number }[] = []
  for (const piece of first) {
    if (piece.text.length <= MAX_UNIT) {
      out.push(piece)
      continue
    }
    out.push(...splitLong(piece))
  }
  return out
}

function scanSentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = []
  let start = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    let end = -1
    if (ENDERS.has(ch)) {
      end = i + 1
      while (end < text.length && (ENDERS.has(text[end]) || text[end] === '…')) end += 1
      if (text[end] === '…') {
        while (end < text.length && text[end] === '…') end += 1
      }
      end = includeClosers(text, end)
    } else if (ch === '.') {
      const run = dotRun(text, i)
      if (run > 1) {
        end = includeClosers(text, i + run)
      } else if (isSentenceDot(text, i)) {
        end = includeClosers(text, i + 1)
      }
    } else if (ch === '…') {
      end = i
      while (end < text.length && text[end] === '…') end += 1
      end = includeClosers(text, end)
    }
    if (end < 0) {
      i += 1
      continue
    }
    pushPiece(out, text, start, end)
    start = end
    i = end
  }
  pushPiece(out, text, start, text.length)
  return out
}

function dotRun(text: string, at: number): number {
  let end = at
  while (end < text.length && text[end] === '.') end += 1
  return end - at
}

function includeClosers(text: string, from: number): number {
  let end = from
  while (end < text.length && CLOSERS.has(text[end])) end += 1
  return end
}

function isSentenceDot(text: string, at: number): boolean {
  const before = text[at - 1] ?? ''
  const after = text[at + 1] ?? ''
  if (/\d/.test(before) && /\d/.test(after)) return false
  if (!after) return true
  if (!/\s/.test(after)) return false
  const token = tokenBefore(text, at)
  if (ABBREVIATIONS.has(token.toLowerCase())) return false
  if (token.length === 1 && /[A-Z]/.test(token)) return false
  // "U.S. Army" is not a sentence end. A lowercase next word is also mid-sentence.
  const next = nextVisible(text, at + 1)
  if (next && /[a-z]/.test(next)) return false
  return true
}

function tokenBefore(text: string, at: number): string {
  let start = at
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1])) start -= 1
  return text.slice(start, at)
}

function nextVisible(text: string, from: number): string {
  for (let i = from; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) return text[i]
  }
  return ''
}

function splitLong(piece: { text: string; start: number }): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = []
  let from = 0
  while (piece.text.length - from > MAX_UNIT) {
    const window = piece.text.slice(from, from + MAX_UNIT)
    let cut = -1
    for (let i = window.length - 1; i > 24; i -= 1) {
      if (SOFT_BREAKS.has(window[i])) {
        cut = i + 1
        break
      }
    }
    if (cut < 0) {
      for (let i = window.length - 1; i > 24; i -= 1) {
        if (/\s/.test(window[i])) {
          cut = i + 1
          break
        }
      }
    }
    if (cut <= 0) cut = window.length
    pushPiece(out, piece.text, from, from + cut)
    from += cut
  }
  pushPiece(out, piece.text, from, piece.text.length)
  return out
}

function pushPiece(
  out: { text: string; start: number }[],
  text: string,
  from: number,
  to: number,
): void {
  if (to <= from) return
  const raw = text.slice(from, to)
  const trimmed = raw.trim()
  if (!trimmed) return
  out.push({ text: trimmed, start: from + (raw.length - raw.trimStart().length) })
}

const SPOKEN_WORD = /[\p{L}\p{N}'’-]/u
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

/** The word a browser boundary event points at, in the sentence's own offsets. */
export function wordAt(
  text: string,
  charIndex: number,
  charLength = 0,
): { text: string; offset: number } | null {
  if (!text) return null
  const at = Math.min(Math.max(0, charIndex), text.length - 1)
  if (charLength > 0 && at + charLength <= text.length) {
    const slice = text.slice(at, at + charLength)
    if (slice.trim() && [...slice].some((ch) => SPOKEN_WORD.test(ch))) {
      return { text: slice, offset: at }
    }
  }
  if (!SPOKEN_WORD.test(text[at])) return null
  if (CJK.test(text[at])) {
    // Chinese boundary events usually point at one character. A short run
    // reads better than a single glyph and still follows the voice.
    let end = at
    while (end < text.length && end - at < 4 && CJK.test(text[end])) end += 1
    return { text: text.slice(at, end), offset: at }
  }
  let start = at
  let end = at + 1
  while (start > 0 && SPOKEN_WORD.test(text[start - 1])) start -= 1
  while (end < text.length && SPOKEN_WORD.test(text[end])) end += 1
  return { text: text.slice(start, end), offset: start }
}

