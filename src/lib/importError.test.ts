import { describe, expect, it } from 'vitest'
import { importFile, importMany } from './importBook'
import { encryptionRejectReason, explainImportFailure } from './importError'

const DRM = '这本 EPUB 有加密，Lumi 打不开'
const BROKEN = '这本 EPUB 损坏了，打不开'
const EMPTY = '这个文件是空的'
const FORMAT = 'Lumi 打不开这种格式。请用 EPUB、PDF、MOBI、AZW3 或 FB2'

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    c ^= data[i]
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff]
}

function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
}

/** Uncompressed ZIP, enough for the vendored zip.js reader. */
function storedZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder()
  const locals: number[] = []
  const centrals: number[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(text)
    const crc = crc32(data)
    const local = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
      ...data,
    ]
    const central = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...nameBytes,
    ]
    locals.push(...local)
    centrals.push(...central)
    offset += local.length
  }
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(Object.keys(files).length),
    ...u16(Object.keys(files).length),
    ...u32(centrals.length),
    ...u32(offset),
    ...u16(0),
  ]
  return new Uint8Array([...locals, ...centrals, ...end])
}

const FONT_XML = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#">
    <EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <CipherData><CipherReference URI="OEBPS/fonts/song.otf"/></CipherData>
  </EncryptedData>
</encryption>`

const ADEPT_XML = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#">
    <EncryptionMethod Algorithm="http://ns.adobe.com/adept"/>
    <CipherData><CipherReference URI="OEBPS/chapter1.xhtml"/></CipherData>
  </EncryptedData>
</encryption>`

describe('encryptionRejectReason', () => {
  it('allows font obfuscation', () => {
    expect(encryptionRejectReason(FONT_XML)).toBeNull()
    expect(encryptionRejectReason(null)).toBeNull()
    expect(encryptionRejectReason('')).toBeNull()
  })

  it('rejects Adobe ADEPT and any non-font algorithm', () => {
    expect(encryptionRejectReason(ADEPT_XML)).toBe(DRM)
    expect(encryptionRejectReason(`${FONT_XML}\n${ADEPT_XML}`)).toBe(DRM)
    expect(encryptionRejectReason('<EncryptedData></EncryptedData>')).toBe(DRM)
  })
})

describe('explainImportFailure', () => {
  it('turns foliate errors into Chinese sentences', () => {
    const unsupported = new Error('File type not supported')
    unsupported.name = 'UnsupportedTypeError'
    const missing = new Error('File not found')
    missing.name = 'NotFoundError'
    expect(explainImportFailure(unsupported)).toBe(FORMAT)
    expect(explainImportFailure(missing)).toBe(EMPTY)
    expect(explainImportFailure(new Error('Failed to load container file'))).toBe(BROKEN)
    expect(explainImportFailure(new Error('End of central directory not found'))).toBe(BROKEN)
  })

  it('keeps the PDF reasons already written for M13', () => {
    expect(explainImportFailure(new Error('这本 PDF 有密码，Lumi 打不开'))).toBe('这本 PDF 有密码，Lumi 打不开')
    expect(explainImportFailure(new Error('这是扫描版 PDF，没有文字层，暂时不能重排'))).toMatch(/扫描/)
  })

  it('keeps the garbled-PDF advice instead of a bare refusal', () => {
    const reason = '这本 PDF 的字体缺文字映射，重排出来全是乱码；请用 Lumi 桌面版导入，会自动 OCR'
    expect(explainImportFailure(new Error(reason))).toBe(reason)
  })

  it('keeps a one-line technical tail on unknown failures', () => {
    expect(explainImportFailure(new Error('Missing MOBI header'))).toBe(
      '这本书打不开（Error: Missing MOBI header）',
    )
    expect(explainImportFailure(new DOMException('boom\nat worker.js', 'UnknownError'))).toBe(
      '这本书打不开（UnknownError: boom at worker.js）',
    )
    expect(explainImportFailure(new RangeError('x'.repeat(400)))).toHaveLength(
      '这本书打不开（）'.length + 120,
    )
  })

  it('says nothing when there is no message to quote', () => {
    expect(explainImportFailure(new Error(''))).toBe('这本书打不开')
    expect(explainImportFailure(null)).toBe('这本书打不开')
  })

  it('quotes a bare string rejection, the shape Tauri uses for invoke errors', () => {
    expect(explainImportFailure('OCR is only built for macOS')).toBe(
      '这本书打不开（OCR is only built for macOS）',
    )
  })

  it('keeps a short history of raw failures for reading off the device', () => {
    localStorage.clear()
    explainImportFailure(new DOMException('Setting up fake worker failed', 'UnknownError'))
    explainImportFailure(new Error('这本书打不开（TypeError: boom）'))
    const saved = JSON.parse(localStorage.getItem('leaf:lastImportError') ?? '[]') as Array<Record<string, unknown>>
    expect(saved).toHaveLength(2)
    expect(saved[0].name).toBe('UnknownError')
    expect(saved[0].message).toBe('Setting up fake worker failed')
    expect(saved[1].name).toBe('Error')
    expect(typeof saved[1].at).toBe('string')
  })

  it('caps the history so repeated failures cannot fill storage', () => {
    localStorage.clear()
    for (let i = 0; i < 6; i += 1) explainImportFailure(new Error(`失败 ${i}`))
    const saved = JSON.parse(localStorage.getItem('leaf:lastImportError') ?? '[]') as Array<Record<string, unknown>>
    expect(saved).toHaveLength(3)
    expect(saved[2].message).toBe('失败 5')
  })
})

describe('importFile failure reasons', () => {
  it('rejects an empty file before opening it', async () => {
    const file = new File([], 'empty.epub')
    await expect(importFile(file)).rejects.toThrow(EMPTY)
  })

  it('rejects a DRM epub instead of saving a blank book', async () => {
    const bytes = storedZip({ 'META-INF/encryption.xml': ADEPT_XML, 'META-INF/container.xml': '<container/>' })
    const file = new File([bytes], 'adept.epub', { type: 'application/epub+zip' })
    await expect(importFile(file)).rejects.toThrow(DRM)
  })

  it('rejects a truncated zip as a broken epub', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 1, 2])], 'torn.epub')
    await expect(importFile(file)).rejects.toThrow(BROKEN)
  })

  it('rejects a plain text file with the format sentence', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    await expect(importFile(file)).rejects.toThrow(FORMAT)
  })

  it('reports every failed file and keeps going', async () => {
    const errors = await importMany([
      new File([], 'a.epub'),
      new File(['x'], 'b.txt', { type: 'text/plain' }),
    ])
    expect(errors).toEqual([`a.epub：${EMPTY}`, `b.txt：${FORMAT}`])
  })
})
