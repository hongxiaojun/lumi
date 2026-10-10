export type PdfRun = {
  str: string
  x: number
  y: number
  w: number
  h: number
}

export type PdfLine = {
  y: number
  x0: number
  x1: number
  h: number
  text: string
}

export function clusterLines(runs: PdfRun[], yTol = 0.35): PdfLine[] {
  const usable = runs.filter((item) => item.str.length > 0)
  usable.sort((a, b) => (Math.abs(a.y - b.y) > 0.5 ? b.y - a.y : a.x - b.x))
  const lines: PdfRun[][] = []
  for (const item of usable) {
    const last = lines[lines.length - 1]
    const seed = last?.[0]
    if (seed && Math.abs(item.y - seed.y) < yTol * Math.max(seed.h, item.h, 1)) {
      last.push(item)
      continue
    }
    lines.push([item])
  }
  return lines.map((group) => {
    group.sort((a, b) => a.x - b.x)
    let text = group[0]?.str ?? ''
    for (let i = 1; i < group.length; i += 1) {
      text += joinGap(group[i - 1], group[i]) + group[i].str
    }
    const first = group[0]
    const last = group[group.length - 1]
    return {
      y: first?.y ?? 0,
      x0: first?.x ?? 0,
      x1: (last?.x ?? 0) + (last?.w ?? 0),
      h: Math.max(...group.map((g) => g.h), 1),
      text,
    }
  })
}

export function linesToHtml(lines: PdfLine[]): string {
  return lines
    .map((line) => `<p>${escapeHtml(line.text)}</p>`)
    .join('')
}

function joinGap(prev: PdfRun, next: PdfRun): string {
  const left = prev.str.slice(-1)
  const right = next.str.slice(0, 1)
  if (/[\u3400-\u9fff]/.test(left) && /[\u3400-\u9fff]/.test(right)) return ''
  const gap = next.x - (prev.x + prev.w)
  if (gap > 0.15 * Math.max(prev.h, next.h, 1)) return ' '
  if (/[A-Za-z]$/.test(prev.str) && /^[A-Za-z]/.test(next.str)) return ' '
  return ''
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
