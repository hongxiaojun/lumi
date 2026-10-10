type OutlineNode = {
  title?: string
  dest?: unknown
  items?: OutlineNode[]
}

type PdfOutlineDoc = {
  getOutline: () => Promise<OutlineNode[] | null>
  getDestination: (name: string) => Promise<unknown>
  getPageIndex: (ref: unknown) => Promise<number>
}

export type PdfOutlineItem = { pageIndex: number; title: string }

export async function outlineFromPdf(pdf: PdfOutlineDoc): Promise<PdfOutlineItem[]> {
  const outline = await pdf.getOutline().catch(() => null)
  if (!Array.isArray(outline) || outline.length === 0) return []
  const byPage = new Map<number, string>()
  await walk(pdf, outline, byPage)
  return [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pageIndex, title]) => ({ pageIndex, title }))
}

async function walk(
  pdf: PdfOutlineDoc,
  nodes: OutlineNode[],
  byPage: Map<number, string>,
): Promise<void> {
  for (const node of nodes) {
    let dest = node.dest
    if (typeof dest === 'string') dest = await pdf.getDestination(dest).catch(() => null)
    if (Array.isArray(dest) && dest[0]) {
      const idx = await pdf.getPageIndex(dest[0]).catch(() => -1)
      if (idx >= 0 && !byPage.has(idx)) {
        byPage.set(idx, String(node.title ?? '').trim())
      }
    }
    if (node.items?.length) await walk(pdf, node.items, byPage)
  }
}
