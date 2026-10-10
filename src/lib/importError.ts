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

export function explainImportFailure(error: unknown): string {
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
  return FAIL
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
