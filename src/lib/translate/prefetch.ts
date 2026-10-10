export const PREFETCH_AHEAD = 1
export const MAX_BLOCKS = 80

export type LinearSection = {
  linear?: string
  createDocument?: () => Promise<Document>
}

export function nextLinearIndexes(
  sections: LinearSection[],
  current: number,
  ahead = PREFETCH_AHEAD,
): number[] {
  const out: number[] = []
  if (ahead < 1) return out
  for (let i = current + 1; i < sections.length && out.length < ahead; i++) {
    if (sections[i]?.linear === 'no') continue
    if (!sections[i]?.createDocument) continue
    out.push(i)
  }
  return out
}

export function capBlocks<T>(blocks: T[], max = MAX_BLOCKS): T[] {
  if (blocks.length <= max) return blocks
  return blocks.slice(0, max)
}
