export const READ_FOCUS_DIM = 'leaf-focus-dim'
export const READ_FOCUS_HERE = 'leaf-focus-here'

const MARKS = `.${READ_FOCUS_DIM}, .${READ_FOCUS_HERE}`

/** Blur recedes the other paragraphs. Reduced motion keeps the fade and drops the blur. */
export function readFocusDim(reducedMotion: boolean): { filter: string; opacity: number } {
  if (reducedMotion) return { filter: 'none', opacity: 0.4 }
  return { filter: 'blur(2px)', opacity: 0.5 }
}

/** A light wash on the spoken paragraph. Neutral, so the blue sentence and cyan word stay in front. */
export function readFocusHere(): string {
  return 'color-mix(in srgb, currentColor 6%, transparent)'
}

export function readFocusCSS(): string {
  const dim = readFocusDim(false)
  const still = readFocusDim(true)
  return `
    .${READ_FOCUS_DIM} {
      filter: ${dim.filter};
      opacity: ${dim.opacity};
    }
    .${READ_FOCUS_HERE} {
      background-color: ${readFocusHere()};
    }
    @media (prefers-reduced-motion: reduce) {
      .${READ_FOCUS_DIM} {
        filter: ${still.filter};
        opacity: ${still.opacity};
      }
    }
  `
}

// Classes land on the spoken blocks. A blur on an ancestor cannot be undone for
// the current paragraph, and the current paragraph's translation stays sharp.
export function paintReadFocus(sources: readonly Element[], currentIndex: number | null): void {
  clearFocus(sources)
  if (currentIndex == null || currentIndex < 0 || currentIndex >= sources.length) return
  const current = sources[currentIndex]
  if (!current) return
  current.classList.add(READ_FOCUS_HERE)
  for (let i = 0; i < sources.length; i += 1) {
    if (i === currentIndex) continue
    sources[i]?.classList.add(READ_FOCUS_DIM)
  }
  const doc = current.ownerDocument
  if (!doc) return
  for (const node of doc.querySelectorAll('[data-leaf-tr], .leaf-tr')) {
    if (!(node instanceof Element)) continue
    if (keptWithCurrent(current, node, sources)) {
      node.classList.remove(READ_FOCUS_DIM, READ_FOCUS_HERE)
      continue
    }
    if (sources.some((source) => source !== current && source.contains(node))) continue
    node.classList.add(READ_FOCUS_DIM)
  }
}

function clearFocus(sources: readonly Element[]): void {
  const docs = new Set<Document>()
  for (const source of sources) {
    source.classList.remove(READ_FOCUS_DIM, READ_FOCUS_HERE)
    const doc = source.ownerDocument
    if (doc) docs.add(doc)
  }
  for (const doc of docs) {
    for (const el of doc.querySelectorAll(MARKS)) el.classList.remove(READ_FOCUS_DIM, READ_FOCUS_HERE)
  }
}

function keptWithCurrent(current: Element, node: Element, sources: readonly Element[]): boolean {
  if (current.contains(node)) return true
  let sib = current.nextElementSibling
  while (sib && !sources.includes(sib)) {
    if (sources.some((source) => sib?.contains(source))) break
    if (sib === node || sib.contains(node)) return true
    sib = sib.nextElementSibling
  }
  return false
}
