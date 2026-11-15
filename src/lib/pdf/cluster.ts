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

/** A gap this wide is a column gutter, not a word space: justified text stretches
 * a space to about 0.6 em at worst, real gutters run 1.5–3 em. layout.ts imports
 * this value as its minimum gutter width, so both halves agree on what a gutter is. */
export const LINE_SPLIT_EM = 1.8

/** The ligature runs pdf.js reports on their own, already expanded to letters. */
const LIGATURE = /^(?:ffi|ffl|fi|fl|ff)$/

export function clusterLines(runs: PdfRun[], yTol = 0.35): PdfLine[] {
  const usable = runs.filter((item) => item.str.length > 0)
  usable.sort((a, b) => (Math.abs(a.y - b.y) > 0.5 ? b.y - a.y : a.x - b.x))
  const lines: PdfRun[][] = []
  for (const item of usable) {
    const last = lines[lines.length - 1]
    const seed = last?.[0]
    const prev = last?.[last.length - 1]
    if (seed && prev && sameLine(seed, prev, item, yTol)) {
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

function sameLine(seed: PdfRun, prev: PdfRun, next: PdfRun, yTol: number): boolean {
  const size = Math.max(prev.h, next.h, 1)
  if (Math.abs(next.y - seed.y) >= yTol * Math.max(seed.h, next.h, 1)) return false
  // Runs in different columns share a baseline, so the y test alone would glue
  // the tail of the left column to the head of the right one.
  return next.x - (prev.x + prev.w) <= LINE_SPLIT_EM * size
}

function joinGap(prev: PdfRun, next: PdfRun): string {
  const left = prev.str.slice(-1)
  const right = next.str.slice(0, 1)
  if (/[\u3400-\u9fff]/.test(left) && /[\u3400-\u9fff]/.test(right)) return ''
  const gap = next.x - (prev.x + prev.w)
  // pdf.js emits the ﬁ ligature as a run of its own whose text is already the
  // two letters: "identi" + "fi" + "es", each butted against the next with no
  // gap. The letter-to-letter fallback below would read both joins as word
  // breaks and print "identi fi es", which is what every English journal PDF
  // looks like without this. A real word space always renders as a gap, so the
  // rule only holds while the two runs touch.
  if (gap <= 0.05 * Math.max(prev.h, next.h, 1) && (LIGATURE.test(prev.str) || LIGATURE.test(next.str))) {
    return ''
  }
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
