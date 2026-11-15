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
  const rows = byBaseline(
    runs.filter((item) => item.str.length > 0),
    yTol,
  )
  const lines: PdfRun[][] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    let group: PdfRun[] = []
    for (const item of row) {
      const prev = group[group.length - 1]
      if (prev && !sameLine(prev, item)) {
        lines.push(group)
        group = []
      }
      group.push(item)
    }
    if (group.length) lines.push(group)
  }
  return lines.map((group) => {
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

/** Runs bucketed by baseline, top of the page first.
 *
 * Bucketing before anything else is what keeps a two-column page readable: the
 * content stream writes a whole column at a time, so the left column's lines
 * all arrive before the right column's, and a single pass that trusts arrival
 * order pairs a line with the wrong neighbour. Each row is anchored on its
 * first run, which makes the grouping independent of the order runs come in.
 */
function byBaseline(runs: PdfRun[], yTol: number): PdfRun[][] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: PdfRun[][] = []
  for (const item of sorted) {
    const row = rows[rows.length - 1]
    const anchor = row?.[0]
    if (anchor && Math.abs(item.y - anchor.y) < yTol * Math.max(anchor.h, item.h, 1)) row.push(item)
    else rows.push([item])
  }
  return rows
}

export function linesToHtml(lines: PdfLine[]): string {
  return lines
    .map((line) => `<p>${escapeHtml(line.text)}</p>`)
    .join('')
}

/** Two runs side by side on one baseline are one line unless the page between
 * them is wider than a word space.
 *
 * The em comes from the smaller of the two runs, not the larger. A section
 * heading is set a point bigger than the body it interrupts, and measuring the
 * gutter with the heading's em is what let this page through: 18 pt of gutter
 * read as 1.79 em against the 10 pt heading, under LINE_SPLIT_EM, so every
 * heading landed mid-sentence at the head of the column beside it.
 */
function sameLine(prev: PdfRun, next: PdfRun): boolean {
  const size = Math.max(Math.min(prev.h, next.h), 1)
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
