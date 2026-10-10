declare module 'foliate-js/view.js' {
  export function makeBook(file: File | Blob | string): Promise<unknown>
}

declare module 'foliate-js/vendor/zip.js' {
  export function configure(options: { useWebWorkers?: boolean }): void
  export class BlobReader {
    constructor(blob: Blob)
  }
  export class TextWriter {
    constructor(encoding?: string)
  }
  export class ZipReader {
    constructor(reader: BlobReader)
    getEntries(): Promise<Array<{ filename: string; getData: (writer: TextWriter) => Promise<unknown> }>>
    close(): Promise<void>
  }
}

declare module 'foliate-js/epubcfi.js' {
  export function fromRange(range: Range, filter?: (node: Node) => number): string
  export function toRange(doc: Document, parts: unknown, filter?: (node: Node) => number): Range
  export function parse(cfi: string): { parent?: unknown[] }
  export function joinIndir(...parts: string[]): string
  export const fake: {
    fromIndex(index: number): string
    toIndex(parts: Array<{ index?: number }> | undefined): number
  }
}

declare module 'foliate-js/overlayer.js' {
  export class Overlayer {
    static highlight(rects: DOMRectList, options?: { color?: string }): SVGElement
    static underline(rects: DOMRectList, options?: { color?: string }): SVGElement
    static outline(rects: DOMRectList, options?: { color?: string }): SVGElement
  }
}
