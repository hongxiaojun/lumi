import { randomId } from '../id'

export function makeEpubBlob(input: {
  title: string
  author: string
  language: string
  chapters: Array<{ title: string; html: string }>
}): Blob {
  const chapters = input.chapters.length ? input.chapters : [{ title: input.title, html: '<p></p>' }]
  const id = `urn:uuid:${randomId()}`
  const files: Array<{ name: string; data: Uint8Array; store?: boolean }> = [
    { name: 'mimetype', data: enc('application/epub+zip'), store: true },
    { name: 'META-INF/container.xml', data: enc(CONTAINER) },
    { name: 'OEBPS/content.opf', data: enc(opf({ ...input, id }, chapters)) },
    { name: 'OEBPS/nav.xhtml', data: enc(navXhtml(input.title, chapters)) },
  ]
  chapters.forEach((ch, i) => {
    const name = `OEBPS/ch${String(i + 1).padStart(2, '0')}.xhtml`
    files.push({ name, data: enc(xhtml(ch.title, ch.html)) })
  })
  const packed = zipStore(files)
  const copy = new Uint8Array(packed.byteLength)
  copy.set(packed)
  return new Blob([copy], { type: 'application/epub+zip' })
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

function opf(
  meta: { title: string; author: string; language: string; id: string },
  chapters: Array<{ title: string }>,
): string {
  const manifest = chapters
    .map((_, i) => {
      const id = `ch${i + 1}`
      const href = `ch${String(i + 1).padStart(2, '0')}.xhtml`
      return `<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`
    })
    .join('\n    ')
  const spine = chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join('\n    ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bid">${escapeXml(meta.id)}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
    <dc:language>${escapeXml(meta.language || 'zh')}</dc:language>
    <dc:creator>${escapeXml(meta.author)}</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`
}

function navXhtml(bookTitle: string, chapters: Array<{ title: string }>): string {
  const items = chapters
    .map((ch, i) => {
      const href = `ch${String(i + 1).padStart(2, '0')}.xhtml`
      return `<li><a href="${href}">${escapeXml(ch.title)}</a></li>`
    })
    .join('\n      ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>${escapeXml(bookTitle)}</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
      ${items}
      </ol>
    </nav>
  </body>
</html>`
}

function xhtml(title: string, html: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh">
  <head><title>${escapeXml(title)}</title></head>
  <body>${html}</body>
</html>`
}

function enc(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function zipStore(files: Array<{ name: string; data: Uint8Array; store?: boolean }>): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = enc(file.name)
    const crc = crc32(file.data)
    const local = localHeader(name, file.data, crc)
    locals.push(local, file.data)
    centrals.push(centralHeader(name, file.data, crc, offset))
    offset += local.length + file.data.length
  }
  const central = concat(centrals)
  const end = endCentral(files.length, central.length, offset)
  return concat([...locals, central, end])
}

function localHeader(name: Uint8Array, data: Uint8Array, crc: number): Uint8Array {
  const buf = new Uint8Array(30 + name.length)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x04034b50, true)
  v.setUint16(4, 20, true)
  writeU32(v, 14, crc)
  writeU32(v, 18, data.length)
  writeU32(v, 22, data.length)
  v.setUint16(26, name.length, true)
  buf.set(name, 30)
  return buf
}

function centralHeader(name: Uint8Array, data: Uint8Array, crc: number, offset: number): Uint8Array {
  const buf = new Uint8Array(46 + name.length)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x02014b50, true)
  v.setUint16(4, 20, true)
  v.setUint16(6, 20, true)
  writeU32(v, 16, crc)
  writeU32(v, 20, data.length)
  writeU32(v, 24, data.length)
  v.setUint16(28, name.length, true)
  writeU32(v, 42, offset)
  buf.set(name, 46)
  return buf
}

function endCentral(count: number, centralSize: number, offset: number): Uint8Array {
  const buf = new Uint8Array(22)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x06054b50, true)
  v.setUint16(8, count, true)
  v.setUint16(10, count, true)
  writeU32(v, 12, centralSize)
  writeU32(v, 16, offset)
  return buf
}

function writeU32(view: DataView, at: number, value: number): void {
  view.setUint32(at, value >>> 0, true)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
