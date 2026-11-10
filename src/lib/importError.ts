import { configure, ZipReader, BlobReader, TextWriter } from 'foliate-js/vendor/zip.js'
import { sniffFormat } from './pdf/sniff'

const EMPTY = '这个文件是空的'
const DRM = '这本 EPUB 有加密，Lumi 打不开'
const BROKEN = '这本 EPUB 损坏了，打不开'
const FORMAT = 'Lumi 打不开这种格式。请用 EPUB、PDF、MOBI、AZW3 或 FB2'
const FAIL = '这本书打不开'

const OURS = [
  EMPTY,
  DRM,
  BROKEN,
  FORMAT,
  FAIL,
  '这本 PDF 有密码，Lumi 打不开',
  '这是扫描版 PDF，没有文字层，暂时不能重排',
  '这本 PDF 的字体缺文字映射，重排出来全是乱码；请用 Lumi 桌面版导入，会自动 OCR',
  '这本书没有写入服务器',
]

/** Font obfuscation is not DRM. Foliate already knows how to undo these two. */
const FONT_OBFUSCATION = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
])

export function encryptionRejectReason(xml: string | null | undefined): string | null {
  if (!xml || !/EncryptedData/i.test(xml)) return null
  const algorithms = [...xml.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1])
  if (algorithms.length === 0 || algorithms.some((algo) => !FONT_OBFUSCATION.has(algo))) return DRM
  return null
}

/** Longest technical tail we show. Enough for "UnknownError: Setting up fake worker failed",
 * short enough to stay on one line on a phone. */
const DETAIL_MAX = 120

/** The last few failures, kept in localStorage so a bug that only reproduces on a phone
 * can be read back from the app container instead of guessed at from a screenshot.
 * A history, not a single slot: importPrepared rethrows a wrapped copy of the real
 * error, and that copy overwrites the original stack. */
const BREADCRUMB = 'leaf:lastImportError'
const BREADCRUMB_MAX = 3

function recordImportFailure(error: unknown): void {
  try {
    const name = (error instanceof Error ? error.name : '') || field(error, 'name') || typeof error
    const message =
      (error instanceof Error ? error.message : '') || field(error, 'message') || String(error ?? '')
    const stack = ((error instanceof Error ? error.stack : '') || field(error, 'stack')).slice(0, 600)
    const stored: unknown = JSON.parse(localStorage.getItem(BREADCRUMB) ?? '[]')
    const history = Array.isArray(stored) ? stored : []
    history.push({ at: new Date().toISOString(), name, message, stack })
    localStorage.setItem(BREADCRUMB, JSON.stringify(history.slice(-BREADCRUMB_MAX)))
  } catch {
    // A blocked or full quota only loses the breadcrumb, never the import.
  }
}

function field(error: unknown, key: string): string {
  if (typeof error !== 'object' || error === null) return ''
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

/** Unknown failures keep a one-line technical tail. Without it a device-only bug
 * (iOS throws where the Mac does not) reads as a bare "打不开" and cannot be
 * diagnosed from the screen. Tauri rejects an invoke with a bare string, so
 * strings carry the whole reason. */
function withDetail(error: unknown): string {
  const raw = typeof error === 'string' ? error : field(error, 'message')
  const name = field(error, 'name')
  const detail = raw ? `${name ? `${name}: ` : ''}${raw}`.replace(/\s+/g, ' ').trim() : ''
  if (!detail) return FAIL
  return `${FAIL}（${detail.slice(0, DETAIL_MAX)}）`
}

export function explainImportFailure(error: unknown): string {
  recordImportFailure(error)
  const message = error instanceof Error ? error.message : ''
  const name = error instanceof Error ? error.name : ''
  const known = OURS.find((line) => message.includes(line))
  if (known) return known
  if (name === 'NotFoundError' || /File not found/i.test(message)) return EMPTY
  if (name === 'UnsupportedTypeError' || /File type not supported/i.test(message)) return FORMAT
  if (
    /Failed to load container|No package document|Failed to load package|XML parsing error|central directory|not recognized|File format is not recognized/i.test(
      message,
    )
  ) {
    return BROKEN
  }
  return withDetail(error)
}

function isEncryptionEntry(name: string): boolean {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
  return normalized === 'meta-inf/encryption.xml'
}

async function encryptionXml(file: Blob): Promise<string | null> {
  configure({ useWebWorkers: false })
  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries()
    const entry = entries.find((item) => isEncryptionEntry(item.filename))
    if (!entry) return null
    const text = await entry.getData(new TextWriter())
    return typeof text === 'string' ? text : null
  } catch {
    return null
  } finally {
    await reader.close()
  }
}

/** Refuse ADEPT / LCP before foliate opens the book. A DRM file otherwise imports and reads blank. */
export async function guardEpub(file: Blob): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (sniffFormat(head) !== 'zip') return
  const reason = encryptionRejectReason(await encryptionXml(file))
  if (reason) throw new Error(reason)
}
