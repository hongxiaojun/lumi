import { TAP_SLOP, type TapPlace } from './pageTap'
import { paintReadFocus } from './readFocus'

// Edge 大声朗读 walks the top document and splits text nodes while it speaks.
// These nodes stay imperative so React never reconciles them, and a chapter
// that has not changed is left untouched.
// While speaking, Edge wraps the sentence in msreadoutspan.msreadout-line-highlight
// and the current word in msreadoutspan.msreadout-word-highlight.

export type ReadAloudBlock = { tag: string; text: string }

export type ReadAloudMark = {
  blockIndex: number
  line: string
  word: string | null
  wordOffset: number | null
}

export type ReadAloudPainter = {
  add: (key: string, range: Range) => void
  remove: (key: string) => void
}

export const READ_ALOUD_LINE = 'leaf-read-line'
export const READ_ALOUD_WORD = 'leaf-read-word'
// Saturated enough that 0.74 / 0.84 opacity still reads as light blue and
// light cyan on cream, kraft, and night paper. Amber sat too close to those pages.
export const READ_ALOUD_LINE_COLOR = '#2F8FE8'
export const READ_ALOUD_WORD_COLOR = '#14C8C4'
export const READ_ALOUD_LINE_OPACITY = 0.74
export const READ_ALOUD_WORD_OPACITY = 0.84

export function readAloudInk(key: string): { color: string; opacity: number } {
  if (key === READ_ALOUD_WORD) return { color: READ_ALOUD_WORD_COLOR, opacity: READ_ALOUD_WORD_OPACITY }
  return { color: READ_ALOUD_LINE_COLOR, opacity: READ_ALOUD_LINE_OPACITY }
}

export type ReadAloudPage = {
  add: (key: string, range: Range, color: string, opacity: number) => void
  remove: (key: string) => void
  redraw: () => void
  scrollTo: (range: Range) => Promise<void> | void
}

const ALLOWED = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'li', 'blockquote'])
const SKIP = new Set(['script', 'style', 'nav', 'noscript', 'template', 'svg', 'math', 'rt', 'rp'])
const published = new WeakMap<HTMLElement, string>()

export function readAloudLang(script: string | undefined): string | null {
  if (script === 'en') return 'en'
  if (script === 'zh' || script === 'mixed') return 'zh-CN'
  return null
}

export function readAloudSources(root: ParentNode): Element[] {
  const sources: Element[] = []
  for (const node of elementsUnder(root)) {
    if (!ALLOWED.has(localName(node))) continue
    if (hasTag(node.parentElement, ALLOWED)) continue
    if (hasTag(node, SKIP)) continue
    if (node.closest('[data-leaf-tr], .leaf-tr')) continue
    if (!spokenText(node)) continue
    sources.push(node)
  }
  if (sources.length > 0) return sources
  if (root instanceof Element && spokenText(root)) return [root]
  return []
}

export function blocksForSources(sources: readonly Element[]): ReadAloudBlock[] {
  return sources.map((node) => ({
    tag: ALLOWED.has(localName(node)) ? localName(node) : 'p',
    text: spokenText(node),
  }))
}

export function readAloudBlocks(root: ParentNode): ReadAloudBlock[] {
  // EPUB sections are XHTML. Tag names, not `querySelectorAll('p')`, see namespaced elements.
  return blocksForSources(readAloudSources(root))
}

export function renderReadAloud(
  host: HTMLElement,
  blocks: ReadAloudBlock[],
  lang: string | null,
): void {
  const existing = host.querySelector(':scope > article.read-aloud')
  if (blocks.length === 0) {
    existing?.remove()
    published.delete(host)
    return
  }
  const sig = `${lang ?? ''}\n${blocks.map((block) => `${block.tag}\n${block.text}`).join('\n')}`
  if (existing && published.get(host) === sig) return
  const article = existing instanceof HTMLElement ? existing : document.createElement('article')
  if (!(existing instanceof HTMLElement)) host.insertBefore(article, host.firstChild)
  article.className = 'read-aloud'
  if (lang) article.lang = lang
  else article.removeAttribute('lang')
  article.replaceChildren(...blocks.map((block) => elementForBlock(block)))
  published.set(host, sig)
}

function blockMarker(block: ReadAloudBlock): string {
  const tag = ALLOWED.has(block.tag) ? block.tag : 'p'
  return `${tag}\n${block.text}`
}

function elementForBlock(block: ReadAloudBlock): HTMLElement {
  const tag = ALLOWED.has(block.tag) ? block.tag : 'p'
  const el = document.createElement(tag)
  el.textContent = block.text
  el.setAttribute('data-leaf-block', blockMarker(block))
  return el
}

function childMarker(el: Element): string {
  return el.getAttribute('data-leaf-block') || `${localName(el)}\n${el.textContent || ''}`
}

// Chapter identity lives on the element, so Edge wrapping the words does not
// hide which chapter a paragraph belongs to.
export function spokenChapterOffset(article: HTMLElement, blocks: readonly ReadAloudBlock[]): number | null {
  if (blocks.length === 0) return null
  const children = [...article.children]
  const head = blockMarker(blocks[0])
  const tail = blockMarker(blocks[blocks.length - 1])
  const mid = blocks.length > 2 ? blockMarker(blocks[1]) : null
  for (let i = 0; i <= children.length - blocks.length; i += 1) {
    if (childMarker(children[i]) !== head) continue
    if (childMarker(children[i + blocks.length - 1]) !== tail) continue
    if (mid != null && childMarker(children[i + 1]) !== mid) continue
    return i
  }
  return null
}

export function appendReadAloud(
  host: HTMLElement,
  blocks: ReadAloudBlock[],
  lang: string | null,
): boolean {
  if (blocks.length === 0) return false
  const article = host.querySelector(':scope > article.read-aloud')
  if (!(article instanceof HTMLElement)) {
    renderReadAloud(host, blocks, lang)
    return host.querySelector(':scope > article.read-aloud') != null
  }
  if (spokenChapterOffset(article, blocks) != null) return false
  const frag = document.createDocumentFragment()
  for (const block of blocks) frag.append(elementForBlock(block))
  article.append(frag)
  return true
}

// Returns the article index of this chapter. A chapter Edge is already reading
// stays in place, highlight spans included. A new chapter replaces the article
// and, if readout is on, selects it so Edge can continue.
export function keepReadAloud(
  host: HTMLElement,
  blocks: ReadAloudBlock[],
  lang: string | null,
): number | null {
  const article = host.querySelector(':scope > article.read-aloud')
  if (article instanceof HTMLElement) {
    const found = spokenChapterOffset(article, blocks)
    if (found != null) return found
    if (article.dataset.leafSpeaking === '1' && blocks.length === 0) return null
  }
  const speaking = article instanceof HTMLElement && article.dataset.leafSpeaking === '1'
  renderReadAloud(host, blocks, lang)
  const next = host.querySelector(':scope > article.read-aloud')
  if (speaking && next instanceof HTMLElement) selectArticle(next)
  return blocks.length > 0 ? 0 : null
}

// From the selection through the end of this chapter. Edge is already speaking
// the article, so the article is rewritten to start at the selected words.
// Earlier paragraphs are dropped. A translation inside the passage stays out.
export function readAloudFromSelection(
  sources: readonly Element[],
  range: Range,
): ReadAloudBlock[] | null {
  if (range.collapsed) return null
  const origin = range.startContainer.ownerDocument
  if (!origin) return null
  const blocks: ReadAloudBlock[] = []
  let started = false
  for (const source of sources) {
    if (source.ownerDocument !== origin) continue
    const nodes = textNodes(source, null)
    let raw = ''
    for (const node of nodes) {
      const from = started ? 0 : spokenOffset(node, range)
      if (from == null) continue
      started = true
      raw += node.data.slice(from)
    }
    const text = normalizeSpoken(raw)
    if (!text) continue
    blocks.push({
      tag: ALLOWED.has(localName(source)) ? localName(source) : 'p',
      text,
    })
  }
  return blocks.length > 0 ? blocks : null
}

function spokenOffset(node: Text, range: Range): number | null {
  const doc = node.ownerDocument
  if (!doc) return null
  const endPoint = doc.createRange()
  endPoint.setStart(node, node.data.length)
  endPoint.collapse(true)
  if (range.compareBoundaryPoints(Range.START_TO_START, endPoint) >= 0) return null
  if (range.startContainer === node) return Math.min(range.startOffset, node.data.length)
  const startPoint = doc.createRange()
  startPoint.setStart(node, 0)
  startPoint.collapse(true)
  if (range.compareBoundaryPoints(Range.START_TO_START, startPoint) <= 0) return 0
  let lo = 0
  let hi = node.data.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const probe = doc.createRange()
    probe.setStart(node, mid)
    probe.collapse(true)
    if (range.compareBoundaryPoints(Range.START_TO_START, probe) > 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function readAloudMark(article: Element): ReadAloudMark | null {
  const words = spans(article, 'msreadout-word-highlight')
  const wordEl = words.at(-1) ?? null
  const lines = spans(article, 'msreadout-line-highlight')
  const lineEl = wordEl?.closest('msreadoutspan.msreadout-line-highlight') ?? lines.at(-1) ?? null
  const anchor = lineEl ?? wordEl
  if (!anchor) return null
  const line = spokenText(anchor)
  if (!line) return null
  const block = blockElement(article, anchor)
  if (!block) return null
  const blockIndex = [...article.children].indexOf(block)
  if (blockIndex < 0) return null
  const word = wordEl ? spokenText(wordEl) : ''
  const wordOffset = wordEl && lineEl ? collapsedPrefixLength(rawText(lineEl, wordEl)) : word ? 0 : null
  return { blockIndex, line, word: word || null, wordOffset: word ? wordOffset : null }
}

export function rangeForSpoken(
  source: Node,
  line: string,
  word: string | null,
  wordOffset: number | null,
): { line: Range[]; word: Range | null } | null {
  const doc = source.ownerDocument
  if (!doc || !line) return null
  const nodes = textNodes(source, null)
  const raw = nodes.map((node) => node.data).join('')
  const text = normalizeSpoken(raw)
  // Edge inserts spaces when it wraps a word. The book text often has none.
  const found = looseSpan(text, line)
  if (!found) return null
  const span = rawSpan(raw, found.start, found.end - found.start)
  if (!span) return null
  // A translation or ruby reading can sit between spoken words. One Range
  // would cover that gap, so the sentence is painted as separate pieces.
  const lineRanges = spokenRanges(doc, nodes, span.start, span.end)
  if (lineRanges.length === 0) return null
  const wordRange = wordRangeFor(doc, nodes, raw, text, found, line, word, wordOffset)
  return { line: lineRanges, word: wordRange }
}

// Edge inserts spaces when it wraps a word. Soft hyphens and zero-width
// characters are ignored the same way. An exact match still wins, so a real
// space in the book is not painted onto an earlier word that only matches
// once those spaces are removed.
function isLooseChar(ch: string): boolean {
  return ch === ' ' || ch === '\u00ad' || ch === '\u200b' || ch === '\ufeff'
}

function squeezeMap(value: string): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  for (let i = 0; i < value.length; i += 1) {
    if (isLooseChar(value[i])) continue
    text += value[i]
    map.push(i)
  }
  return { text, map }
}

function skippedCount(value: string, until: number): number {
  let count = 0
  const end = Math.max(0, Math.min(until, value.length))
  for (let i = 0; i < end; i += 1) {
    if (!isLooseChar(value[i])) count += 1
  }
  return count
}

function looseSpan(text: string, line: string): { start: number; end: number } | null {
  if (!line) return null
  const exact = text.indexOf(line)
  if (exact >= 0) return { start: exact, end: exact + line.length }
  const hay = squeezeMap(text)
  const needle = squeezeMap(line)
  if (!needle.text) return null
  const at = hay.text.indexOf(needle.text)
  if (at < 0) return null
  const last = at + needle.text.length - 1
  return { start: hay.map[at], end: hay.map[last] + 1 }
}

function wordRangeFor(
  doc: Document,
  nodes: Text[],
  raw: string,
  text: string,
  found: { start: number; end: number },
  line: string,
  word: string | null,
  wordOffset: number | null,
): Range | null {
  if (!word || wordOffset == null) return null
  const wordText = squeezeMap(word).text
  if (!wordText) return null
  const hay = squeezeMap(text.slice(found.start, found.end))
  const wordAt = skippedCount(line, wordOffset)
  const wordLast = wordAt + wordText.length - 1
  if (wordLast >= hay.map.length) return null
  if (hay.text.slice(wordAt, wordAt + wordText.length) !== wordText) return null
  const startNorm = found.start + hay.map[wordAt]
  const length = hay.map[wordLast] + 1 - hay.map[wordAt]
  return rangeFromNorm(doc, nodes, raw, startNorm, length)
}

let linePartCount = 0

function linePartKey(index: number): string {
  return index === 0 ? READ_ALOUD_LINE : `${READ_ALOUD_LINE}:${index}`
}

function clearPaint(painter: { remove: (key: string) => void }) {
  painter.remove(READ_ALOUD_WORD)
  for (let i = 0; i < linePartCount; i += 1) painter.remove(linePartKey(i))
  linePartCount = 0
}

function spokenMatch(sources: readonly Element[], mark: ReadAloudMark) {
  const order = [mark.blockIndex]
  for (let i = 0; i < sources.length; i += 1) if (i !== mark.blockIndex) order.push(i)
  for (const index of order) {
    const source = sources[index]
    if (!source) continue
    const ranges = rangeForSpoken(source, mark.line, mark.word, mark.wordOffset)
    if (ranges) return { index, ranges }
  }
  return null
}

function rangesForMark(sources: readonly Element[], mark: ReadAloudMark) {
  return spokenMatch(sources, mark)?.ranges ?? null
}

function spokenSourceIndex(sources: readonly Element[], mark: ReadAloudMark): number | null {
  return spokenMatch(sources, mark)?.index ?? null
}

export function paintReadAloud(
  mark: ReadAloudMark | null,
  sources: readonly Element[],
  painter: ReadAloudPainter,
  follow: ((range: Range) => void) | null,
): boolean {
  if (!mark) {
    clearPaint(painter)
    return true
  }
  const ranges = rangesForMark(sources, mark)
  // A sentence Edge wrapped with extra spaces used to miss and wipe the
  // highlight that was already on the page. Keep the previous mark instead.
  if (!ranges) return false
  clearPaint(painter)
  ranges.line.forEach((range, index) => painter.add(linePartKey(index), range))
  linePartCount = ranges.line.length
  if (ranges.word) painter.add(READ_ALOUD_WORD, ranges.word)
  if (follow) follow(ranges.line[0])
  return true
}

const HOLD_MS = 180

export function watchReadAloud(
  article: HTMLElement,
  onMark: (mark: ReadAloudMark | null) => void | false,
): () => void {
  let queued = false
  let last = '\u0000'
  let clearTimer = 0
  const emit = (mark: ReadAloudMark | null) => {
    const key = mark
      ? `${mark.blockIndex}\u0001${mark.line}\u0001${mark.wordOffset ?? ''}\u0001${mark.word ?? ''}`
      : ''
    if (key === last) return
    last = key
    if (onMark(mark) === false) last = '\u0000'
  }
  const flush = () => {
    queued = false
    const mark = readAloudMark(article)
    if (!mark) {
      // Replacing the article for a selection removes Edge's wrap on purpose.
      if (article.dataset.leafRetarget === '1') {
        delete article.dataset.leafRetarget
        return
      }
      // Edge removes the old wrap before inserting the next word.
      if (clearTimer) return
      clearTimer = window.setTimeout(() => {
        clearTimer = 0
        if (!readAloudMark(article)) {
          delete article.dataset.leafSpeaking
          emit(null)
        }
      }, HOLD_MS)
      return
    }
    article.dataset.leafSpeaking = '1'
    if (clearTimer) {
      window.clearTimeout(clearTimer)
      clearTimer = 0
    }
    emit(mark)
  }
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    queueMicrotask(flush)
  })
  observer.observe(article, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  })
  flush()
  return () => {
    observer.disconnect()
    if (clearTimer) window.clearTimeout(clearTimer)
  }
}

// A click on the book page. 划线笔记 and a selection that locates speech
// both consume the click. A pointer that moved is not a tap. A still tap
// turns only on the side margin; the page itself opens the tools.
export type BookClick = 'note' | 'locate' | 'left' | 'right' | 'chrome' | 'stay'

export function bookClickAction(input: {
  noting: boolean
  selected: boolean
  speaking: boolean
  place: TapPlace
  moved: boolean
}): BookClick {
  if (input.noting) return 'note'
  if (input.selected) return input.speaking ? 'locate' : 'note'
  if (input.moved) return 'stay'
  if (input.place === 'left') return 'left'
  if (input.place === 'right') return 'right'
  return 'chrome'
}

// Remembers the pointer gesture across mouseup and the click that follows it.
// Retarget clears the iframe selection on a timer, which can run before click,
// so the click has to remember that this gesture was a selection.
export function bookClickGate() {
  let selected = false
  let noting = false
  let x = 0
  let y = 0
  let moved = false
  return {
    down(menuOpen: boolean, clientX = 0, clientY = 0) {
      selected = false
      noting = menuOpen
      x = clientX
      y = clientY
      moved = false
    },
    up(selectionText: string, clientX = 0, clientY = 0) {
      selected = selectionText.length > 0
      moved = Math.hypot(clientX - x, clientY - y) > TAP_SLOP
    },
    click(speaking: boolean, selectionText: string, place: TapPlace): BookClick {
      const action = bookClickAction({
        noting,
        selected: selected || selectionText.length > 0,
        speaking,
        place,
        moved,
      })
      selected = false
      noting = false
      moved = false
      return action
    },
  }
}

// The spoken article starts at `range` and continues to the end of the chapter.
// Edge reads that article, and its in-page selection is moved there so
// "continue from here" and a fresh pass both begin on the passage.
// The book selection is cleared on the next turn so a later plain click can
// turn the page. bookClickGate records the drag first, so that clear cannot
// turn the click which ends the drag into a page turn.
// Returns false when Read Aloud is not on the page, or the selection
// has no spoken words.
export function retargetReadAloud(
  host: HTMLElement,
  sources: readonly Element[],
  range: Range,
  lang: string | null,
  page: ReadAloudPage | null,
): Promise<boolean> {
  const article = host.querySelector(':scope > article.read-aloud')
  if (!(article instanceof HTMLElement) || article.dataset.leafSpeaking !== '1') {
    return Promise.resolve(false)
  }
  const blocks = readAloudFromSelection(sources, range)
  if (!blocks) return Promise.resolve(false)
  const painted = highlightFrom(sources, range)
  const before = [...article.children].map((el) => el.textContent ?? '').join('\n')
  const after = blocks.map((block) => block.text).join('\n')
  if (before !== after) article.dataset.leafRetarget = '1'
  renderReadAloud(host, blocks, lang)
  if (before === after) delete article.dataset.leafRetarget
  selectArticle(article)
  const bookDoc = range.startContainer.ownerDocument
  // The book lives in the chapter iframe. Clearing that selection must not
  // drop the selection just placed on the spoken article.
  if (bookDoc && bookDoc !== article.ownerDocument) {
    window.setTimeout(() => bookDoc.getSelection()?.removeAllRanges(), 0)
  }
  if (!page || !painted) return Promise.resolve(true)
  clearPaint(page)
  const ink = readAloudInk(READ_ALOUD_LINE)
  page.add(READ_ALOUD_LINE, painted, ink.color, ink.opacity)
  linePartCount = 1
  return Promise.resolve(page.scrollTo(painted)).then(() => {
    page.redraw()
    window.requestAnimationFrame?.(() => page.redraw())
    return true
  }, () => true)
}

function highlightFrom(sources: readonly Element[], range: Range): Range | null {
  const doc = range.startContainer.ownerDocument
  if (!doc) return null
  for (const source of sources) {
    if (source.ownerDocument !== doc) continue
    const nodes = textNodes(source, null)
    if (nodes.length === 0) continue
    const last = nodes[nodes.length - 1]
    const sourceEnd = doc.createRange()
    sourceEnd.setStart(last, last.data.length)
    sourceEnd.collapse(true)
    if (range.compareBoundaryPoints(Range.START_TO_START, sourceEnd) >= 0) continue
    const sourceStart = doc.createRange()
    sourceStart.setStart(nodes[0], 0)
    sourceStart.collapse(true)
    if (range.compareBoundaryPoints(Range.START_TO_START, sourceStart) < 0) continue
    const painted = doc.createRange()
    painted.setStart(range.startContainer, range.startOffset)
    painted.setEnd(last, last.data.length)
    return painted
  }
  return null
}

function selectArticle(article: HTMLElement): void {
  const doc = article.ownerDocument
  const view = doc.defaultView
  const selection = doc.getSelection()
  if (!selection || !view) return
  const x = view.scrollX
  const y = view.scrollY
  const span = doc.createRange()
  span.selectNodeContents(article)
  selection.removeAllRanges()
  try {
    selection.addRange(span)
  } catch {
    // The article is not in a document yet.
  }
  view.scrollTo(x, y)
}

export type ReadAloudBindOptions = {
  offset?: number
  onPast?: () => void
  /** Other paragraphs recede only while this is true and a sentence is on the page. */
  focus?: () => boolean
}

export type ReadAloudStop = (() => void) & { replay: () => void; follow: () => boolean }

// Edge's mark stays on the hidden article. This paints that sentence onto the
// book and turns the page when the sentence changes. A word inside the same
// sentence only repaints. A drag that is still held does not yank the page.
// replay() paints the same sentence again after a page turn, without scrolling.
// follow() scrolls to it once, after a new chapter has finished opening.
export function bindReadAloud(
  article: HTMLElement,
  sources: readonly Element[],
  doc: Document,
  page: () => ReadAloudPage | null,
  options?: ReadAloudBindOptions,
): ReadAloudStop {
  const offset = options?.offset ?? 0
  let spokenLine = ''
  let turn = 0
  let dragging = false
  let lastMark: ReadAloudMark | null = null
  let advanced = false
  let pendingPast = false
  const hold = () => { dragging = true }
  const release = () => {
    dragging = false
    if (!pendingPast || advanced) return
    advanced = true
    pendingPast = false
    options?.onPast?.()
  }
  doc.addEventListener('mousedown', hold)
  doc.addEventListener('mouseup', release)
  doc.addEventListener('touchstart', hold)
  doc.addEventListener('touchend', release)
  const paintMark = (mark: ReadAloudMark | null, follow: boolean, force = false) => {
    // A block before this chapter belongs to text we kept so Edge can finish
    // the previous page. Leave that mark alone.
    if (mark && mark.blockIndex < offset) return false
    const surface = page()
    if (!surface) return false
    const local = mark ? { ...mark, blockIndex: mark.blockIndex - offset } : null
    const lineKey = mark ? `${mark.blockIndex}\n${mark.line}` : ''
    const followLine = follow && lineKey !== '' && (force || lineKey !== spokenLine) && !dragging
    const painted = paintReadAloud(local, sources, {
      add(key, range) {
        const ink = readAloudInk(key)
        surface.add(key, range, ink.color, ink.opacity)
      },
      remove(key) {
        surface.remove(key)
      },
    }, followLine
      ? (range) => {
          const ticket = ++turn
          void Promise.resolve()
            .then(() => surface.scrollTo(range))
            .then(() => {
              if (ticket !== turn) return
              surface.redraw()
              window.requestAnimationFrame?.(() => {
                if (ticket === turn) surface.redraw()
              })
            }, () => {})
        }
      : null)
    // The article can hold the next chapter. A sentence that is not in this
    // chapter's sources is that chapter, so the book can turn to it. A sentence
    // that still sits in this chapter is painted here, even when its article
    // block index has drifted past the source list.
    const focusOn = options?.focus?.() === true
    if (!focusOn || !local) paintReadFocus(sources, null)
    else if (painted === true) {
      const index = spokenSourceIndex(sources, local)
      if (index != null) paintReadFocus(sources, index)
    }
    if (!painted) {
      if (mark && mark.blockIndex >= offset + sources.length) return 'past' as const
      return false
    }
    pendingPast = false
    spokenLine = lineKey
    return true
  }
  const stopWatch = watchReadAloud(article, (mark) => {
    lastMark = mark
    const result = paintMark(mark, true)
    if (result === 'past') {
      if (dragging) {
        pendingPast = true
        return false
      }
      if (!advanced) {
        advanced = true
        options?.onPast?.()
      }
      return false
    }
    if (!result) return false
  })
  const replay = () => {
    if (!lastMark) return
    const result = paintMark(lastMark, false)
    if (result !== true) return
    const surface = page()
    surface?.redraw()
    window.requestAnimationFrame?.(() => {
      page()?.redraw()
    })
  }
  const followNow = () => {
    if (!lastMark || dragging) return false
    if (paintMark(lastMark, true, true) !== true) return false
    const surface = page()
    surface?.redraw()
    window.requestAnimationFrame?.(() => {
      page()?.redraw()
    })
    return true
  }
  const stop = (() => {
    stopWatch()
    doc.removeEventListener('mousedown', hold)
    doc.removeEventListener('mouseup', release)
    doc.removeEventListener('touchstart', hold)
    doc.removeEventListener('touchend', release)
    paintReadFocus(sources, null)
  }) as ReadAloudStop
  stop.replay = replay
  stop.follow = followNow
  return stop
}

function spans(root: ParentNode, className: string): Element[] {
  return [...root.querySelectorAll('msreadoutspan')].filter((el) => el.classList.contains(className))
}

function blockElement(article: Element, node: Node): Element | null {
  let current: Node | null = node
  while (current && current.parentElement !== article) current = current.parentNode
  return current instanceof Element && current.parentElement === article ? current : null
}

function localName(el: Element): string {
  return (el.localName || el.tagName).toLowerCase()
}

function hasTag(el: Element | null, tags: Set<string>): boolean {
  let current = el
  while (current) {
    if (tags.has(localName(current))) return true
    current = current.parentElement
  }
  return false
}

function elementsUnder(root: ParentNode): Element[] {
  const found: Element[] = []
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      found.push(child as Element)
      walk(child)
    }
  }
  walk(root)
  return found
}

function spokenText(node: Node): string {
  return normalizeSpoken(rawText(node, null))
}

function rawText(node: Node, stop: Node | null): string {
  return textNodes(node, stop).map((item) => item.data).join('')
}

function textNodes(root: Node, stop: Node | null): Text[] {
  const nodes: Text[] = []
  const visit = (current: Node): boolean => {
    if (stop && current === stop) return true
    if (current.nodeType === Node.TEXT_NODE) {
      nodes.push(current as Text)
      return false
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return false
    const el = current as Element
    if (isQuiet(el)) return false
    for (const child of el.childNodes) {
      if (visit(child)) return true
    }
    return false
  }
  visit(root)
  return nodes
}

function normalizeSpoken(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

function collapsedPrefixLength(raw: string): number {
  return raw.replace(/\s+/g, ' ').replace(/^\s+/, '').length
}

function rangeFromNorm(doc: Document, nodes: Text[], raw: string, startNorm: number, length: number): Range | null {
  if (length <= 0) return null
  const span = rawSpan(raw, startNorm, length)
  if (!span) return null
  const start = pointAt(nodes, span.start, 'start')
  const end = pointAt(nodes, span.end, 'end')
  if (!start || !end) return null
  const range = doc.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

function rawSpan(raw: string, startNorm: number, length: number): { start: number; end: number } | null {
  const start = rawIndexAt(raw, startNorm)
  const last = rawIndexAt(raw, startNorm + length - 1)
  if (start == null || last == null) return null
  return { start, end: last + 1 }
}

function rawIndexAt(raw: string, normIndex: number): number | null {
  let norm = -1
  let i = 0
  while (i < raw.length && /\s/.test(raw[i])) i += 1
  let pending = false
  while (i < raw.length) {
    if (/\s/.test(raw[i])) {
      if (norm >= 0) pending = true
      i += 1
      continue
    }
    if (pending) {
      norm += 1
      if (norm === normIndex) {
        let space = i - 1
        while (space > 0 && /\s/.test(raw[space - 1])) space -= 1
        return space
      }
      pending = false
    }
    norm += 1
    if (norm === normIndex) return i
    i += 1
  }
  return null
}

function isQuiet(el: Element): boolean {
  return SKIP.has(localName(el)) || el.hasAttribute('data-leaf-tr') || el.classList.contains('leaf-tr')
}

function successor(node: Node): Node | null {
  if (node.firstChild) return node.firstChild
  let current: Node | null = node
  while (current && !current.nextSibling) current = current.parentNode
  return current?.nextSibling ?? null
}

function gapSkips(from: Text, to: Text): boolean {
  let node = successor(from)
  while (node && node !== to) {
    if (node.nodeType === Node.ELEMENT_NODE && isQuiet(node as Element)) {
      if ((node as Element).contains(to)) {
        node = node.firstChild
        if (!node) return false
        continue
      }
      return true
    }
    node = successor(node)
  }
  return false
}

function spokenRanges(doc: Document, nodes: Text[], start: number, end: number): Range[] {
  const ranges: Range[] = []
  let seen = 0
  let groupStart = -1
  let groupEnd = -1
  let prev: Text | null = null
  const flush = () => {
    if (groupStart < 0) return
    const from = pointAt(nodes, groupStart, 'start')
    const to = pointAt(nodes, groupEnd, 'end')
    if (from && to) {
      const range = doc.createRange()
      range.setStart(from.node, from.offset)
      range.setEnd(to.node, to.offset)
      ranges.push(range)
    }
    groupStart = -1
  }
  for (const node of nodes) {
    const next = seen + node.data.length
    if (next > start && seen < end) {
      if (prev && gapSkips(prev, node)) flush()
      if (groupStart < 0) groupStart = Math.max(start, seen)
      groupEnd = Math.min(end, next)
      prev = node
    } else if (seen >= end) {
      break
    }
    seen = next
  }
  flush()
  return ranges
}

function pointAt(
  nodes: Text[],
  rawIndex: number,
  boundary: 'start' | 'end',
): { node: Text; offset: number } | null {
  let seen = 0
  let last: Text | null = null
  for (const node of nodes) {
    const len = node.data.length
    // The end of one spoken node is the same raw index as the start of the
    // next. Ending on the next node would cover a translation that sits between.
    if (boundary === 'end' && rawIndex === seen + len) return { node, offset: len }
    if (rawIndex < seen + len) return { node, offset: rawIndex - seen }
    seen += len
    last = node
  }
  if (last && rawIndex === seen) return { node: last, offset: last.data.length }
  return null
}
