import { lockDocumentScale } from './lockScale'
import { detectScript, type ScriptKind } from './translate/lang'
import { shouldAttemptUnwrap } from './unwrapLines'

const ZH = new Set(['zh', 'zho', 'chi'])
const EN = new Set(['en', 'eng'])
const LAYOUT_PROP =
  /^(font-family|font-size|font-weight|line-height|text-indent|text-align|text-justify|letter-spacing|color|background|width|max-width|min-width|margin|padding)(-|$)/i
const SENTENCE_END = /[.!?…]['"’”)\]]*$/u
const ZH_SENTENCE_END = /[。！？…!?]\s*[」』”’】）)\]]*$/u
const VERSE_CLASS = /verse|poem|line|stanza|poetry|song/
const NEW_BLOCK = /^[「『“【]|第[零一二三四五六七八九十百千0-9]+[章节回部篇]/
/** A line shorter than this share of the typical line stopped short of the
 * column's right edge, so it is the last line of its paragraph rather than a
 * wrapped one. */
const FULL_LINE_SHARE = 0.7
/** A line this long is body text whatever it opens with; page numbers, run-in
 * headings and table cells are shorter. */
const SHORT_LINE_SHARE = 0.35
/** Fragments shorter than this say nothing about the body's line width. */
const LINE_MIN_CHARS = 20

export function languageFromMeta(value: unknown): ScriptKind | null {
  const primaries = codesOf(value)
    .map(primaryLang)
    .filter((code) => code && code !== 'und')
  if (!primaries.length) return null
  const hasZh = primaries.some((code) => ZH.has(code))
  const hasEn = primaries.some((code) => EN.has(code))
  if (hasZh && hasEn) return 'mixed'
  if (hasZh) return 'zh'
  if (hasEn) return 'en'
  return 'other'
}

export function detectBookLanguage(meta: unknown, sample: string): ScriptKind {
  return languageFromMeta(meta) ?? detectScript(sample)
}

export function shouldTypesetEnglish(kind: ScriptKind): boolean {
  return kind === 'en'
}

export function prepareEnglishSection(doc: Document, bookLang: ScriptKind): ScriptKind {
  return prepareSection(doc, bookLang)
}

export function prepareSection(doc: Document, bookLang: ScriptKind): ScriptKind {
  lockDocumentScale(doc)
  const sample = (doc.body?.textContent ?? '').slice(0, 2500)
  const sectionKind = detectScript(sample)
  let kind = bookLang
  if (kind !== 'en' && sectionKind === 'en') kind = 'en'
  if (kind !== 'zh' && sectionKind === 'zh') kind = 'zh'
  const profile = kind === 'en' || sectionKind === 'en' ? 'en' : 'zh'
  if (kind === 'en' || kind === 'zh' || sectionKind === 'en' || sectionKind === 'zh') {
    restyleDocument(doc, profile)
  }
  return kind
}

export function restyleEnglishDocument(doc: Document): boolean {
  return restyleDocument(doc, 'en')
}

export function restyleDocument(doc: Document, profile: 'en' | 'zh'): boolean {
  const root = doc.body
  if (!root || root.childNodes.length === 0) return false
  if (root.getAttribute('data-leaf-typeset') === profile) return false
  dropPublisherCss(doc)
  stripLayoutStyles(root)
  dropEmptyParagraphs(root)
  unwrapHardBreaks(root, profile)
  mergeHardWrappedParagraphs(root, profile)
  dropEmptyParagraphs(root)
  root.setAttribute('data-leaf-typeset', profile)
  return true
}

function codesOf(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') return value.trim() ? [value] : []
  if (Array.isArray(value)) return value.flatMap(codesOf)
  return []
}

function primaryLang(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? ''
}

function dropPublisherCss(doc: Document): void {
  for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"]')]) link.remove()
  for (const style of [...doc.querySelectorAll('style')]) {
    const text = style.textContent ?? ''
    if (!text.trim()) continue
    if (text.includes('@namespace epub') || text.includes('leaf-tr')) continue
    style.remove()
  }
}

function stripLayoutStyles(root: Element): void {
  const nodes = [root, ...root.querySelectorAll('[style], [align], [face]')]
  for (const el of nodes) {
    const raw = el.getAttribute('style')
    if (raw) {
      const kept = keepNonLayout(raw)
      if (kept) el.setAttribute('style', kept)
      else el.removeAttribute('style')
    }
    el.removeAttribute('align')
    el.removeAttribute('face')
  }
}

function keepNonLayout(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((decl) => !LAYOUT_PROP.test(decl.split(':')[0]?.trim() ?? ''))
    .join('; ')
}

function unwrapHardBreaks(root: Element, profile: 'en' | 'zh'): void {
  for (const br of [...root.querySelectorAll('br')]) {
    if (br.closest('pre, code, textarea, svg')) continue
    const next = followingText(br).replace(/^\s+/, '')
    if (/^[a-z]/.test(next)) {
      br.replaceWith(root.ownerDocument.createTextNode(' '))
      continue
    }
    if (profile === 'zh' && /^[\u3400-\u9fff]/.test(next)) {
      br.replaceWith(root.ownerDocument.createTextNode(''))
    }
  }
}

function followingText(node: Node): string {
  let cur: Node | null = node
  while (cur) {
    let sib = cur.nextSibling
    while (sib) {
      if (sib.nodeType === 3) {
        const text = sib.textContent ?? ''
        if (text.replace(/\s+/g, '').length) return text
      } else if (sib.nodeType === 1) {
        const el = sib as Element
        if (tagName(el) === 'BR') return ''
        const text = el.textContent ?? ''
        if (text.replace(/\s+/g, '').length) return text
      }
      sib = sib.nextSibling
    }
    cur = cur.parentNode
    if (cur && cur.nodeType !== 1) break
  }
  return ''
}

function mergeHardWrappedParagraphs(root: Element, profile: 'en' | 'zh'): void {
  const paras = [...root.querySelectorAll('p, div')].filter(isLineBlock)
  const lengths = paras.map((el) => plain(el).length)
  if (!shouldAttemptUnwrap(lengths, profile)) return
  const typical = typicalLength(lengths)
  for (let i = 0; i < paras.length - 1; i += 1) {
    const a = paras[i]
    const b = nextLineBlock(a)
    if (!b || !isLineBlock(b)) continue
    if (a.parentElement !== b.parentElement) continue
    const left = plain(a)
    const right = plain(b)
    if (!isOpenLine(left, profile) || !continuesLine(left, right, profile, typical)) continue
    dropSkippedBetween(a, b)
    trimLeadingSpace(b)
    if (joinsHyphenatedWord(left)) dropTrailingHyphen(a)
    const gap = joinGap(left, plain(b))
    if (gap) a.append(a.ownerDocument.createTextNode(gap))
    while (b.firstChild) a.append(b.firstChild)
    b.remove()
    paras.splice(paras.indexOf(b), 1)
    i -= 1
  }
}

function dropEmptyParagraphs(root: Element): void {
  for (const p of [...root.querySelectorAll('p')]) {
    if (p.querySelector('img, svg, picture, audio, video, image')) continue
    const text = (p.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, '')
    if (!text) p.remove()
  }
}

function tagName(el: Element): string {
  return el.tagName.toUpperCase()
}

function isLineBlock(el: Element): boolean {
  const tag = tagName(el)
  if (tag !== 'P' && tag !== 'DIV') return false
  if (el.querySelector('p, div, li, img, svg, picture, table, pre, ul, ol, h1, h2, h3, h4')) return false
  return !VERSE_CLASS.test(el.className.toString())
}

function isSkippable(el: Element): boolean {
  if (tagName(el) === 'BR') return true
  if (!isLineBlock(el)) return false
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, '')
  return text.length === 0 && !el.querySelector('img, svg, picture, audio, video, image')
}

function nextLineBlock(el: Element): Element | null {
  let n = el.nextElementSibling
  while (n && isSkippable(n)) n = n.nextElementSibling
  return n
}

function dropSkippedBetween(a: Element, b: Element): void {
  let n = a.nextElementSibling
  while (n && n !== b) {
    const gone = n
    n = n.nextElementSibling
    gone.remove()
  }
}

function trimLeadingSpace(el: Element): void {
  const walk = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = walk.nextNode()
  while (node) {
    const raw = node.textContent ?? ''
    const trimmed = raw.replace(/^[\s\u00a0]+/, '')
    if (trimmed !== raw) node.textContent = trimmed
    if (trimmed.length) return
    node = walk.nextNode()
  }
}

function plain(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function isOpenLine(text: string, profile: 'en' | 'zh'): boolean {
  if (!text) return false
  if (SENTENCE_END.test(text) || ZH_SENTENCE_END.test(text)) return false
  if (/[：:]$/.test(text)) return false
  if (profile === 'en') return /[A-Za-z]/.test(text)
  return /[A-Za-z\u3400-\u9fff]/.test(text)
}

/** The median length of the lines long enough to be body text. Hard-wrapped
 * text runs every line out to the same right edge, so in characters this is
 * that edge: a justified line measures it, a paragraph's last line falls short. */
function typicalLength(lengths: number[]): number {
  const usable = lengths.filter((n) => n >= LINE_MIN_CHARS).sort((a, b) => a - b)
  return usable[Math.floor(usable.length / 2)] ?? 0
}

/** Whether the line ran to the column's right edge, which is what separates a
 * wrapped line from the last line of a paragraph. With no geometry to measure,
 * the typical line stands in for that edge; a document too short to have one
 * keeps the old text-only behaviour. */
function isFullLine(text: string, typical: number): boolean {
  return typical === 0 || text.length >= FULL_LINE_SHARE * typical
}

/** Whether `right` carries on the sentence that `left` leaves open.
 *
 * Checking only for a lowercase first letter merged any paragraph whose next
 * line happened to be lowercased, and on a journal page the leg of a run-in
 * heading is exactly that: a lone "Results" above the tail of the paragraph
 * before it came out as "Results planning).  Inclusion of covariates…", and
 * "Search Results" swallowed "examined as an exploratory moderator." A heading
 * stops well short of the column edge, so the line above it has to be checked
 * as well as the letter the next one opens with.
 */
function continuesLine(
  left: string,
  right: string,
  profile: 'en' | 'zh',
  typical: number,
): boolean {
  if (!right || NEW_BLOCK.test(right)) return false
  if (!isFullLine(left, typical)) return false
  if (/^[a-z]/.test(right)) return true
  if (profile === 'zh' && /^[\u3400-\u9fff]/.test(right)) return true
  // A capital, a digit or an opening bracket can start a continuation or a
  // page number, a heading, a table cell. Only a line long enough to be body
  // text is worth merging: "1130" and "Sensitivity Analyses" are not, while
  // "SFVs dominant sources of information" and "(Y. Wu et al., 2021; …" are.
  if (typical === 0 || right.length < SHORT_LINE_SHARE * typical) return false
  // A line that stops on a digit ends a URL or a page number, never a word
  // half-written: the capital under it opens the next reference entry, which
  // would otherwise be welded onto the one before ("…K-04-2022-0551*Al-Garni").
  return !/\d$/.test(left)
}

function joinGap(left: string, right: string): string {
  // A word followed by an opening bracket keeps the space the line break
  // replaced: "a few minutes" + "(Y. Wu et al., 2021; …" otherwise reads
  // "minutes(Y. Wu".
  if (/[A-Za-z]$/.test(left) && /^[A-Za-z("'“‘[]/.test(right)) return ' '
  // A line that stops on a comma still needs the space the line break replaced:
  // "…sustained cognitive engagement," + "as processing slows" otherwise reads
  // "engagement,as processing slows". Same for the other marks that never touch
  // the following word.
  if (/[,;:)]$/.test(left) && /^[A-Za-z0-9"'(]/.test(right)) return ' '
  return ''
}

/** "con-" + "tinue" is one word broken by the line, so the hyphen has to go;
 * joining it as it stands gives "con-tinue". The caller has already checked
 * that the next line opens in lowercase, which is what tells a split word from
 * a hyphen before a new sentence; a hyphen inside a line ("well-known") never
 * reaches here, and neither does an en or em dash at the line end. */
function joinsHyphenatedWord(left: string): boolean {
  return /[A-Za-z]-$/.test(left)
}

/** Removes the hyphen the previous line ends on, leaving any text node in
 * front of it untouched. */
function dropTrailingHyphen(el: Element): void {
  const walk = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let last: Node | null = null
  let node = walk.nextNode()
  while (node) {
    if ((node.textContent ?? '').trim()) last = node
    node = walk.nextNode()
  }
  if (!last) return
  const raw = last.textContent ?? ''
  last.textContent = raw.replace(/-[\s\u00a0]*$/, '')
}
