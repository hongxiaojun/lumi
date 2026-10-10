export type FileKind = 'pdf' | 'zip' | 'unknown'

export function sniffFormat(bytes: Uint8Array): FileKind {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'pdf'
  }
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip'
  return 'unknown'
}
