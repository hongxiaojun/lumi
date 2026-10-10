export type TextBlock = {
  id: string
  tag: string
  text: string
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NAV'])

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function ownText(node: Element): string {
  let text = ''
  for (const child of node.childNodes) {
    if (child.nodeType === 1 && (child as Element).getAttribute('data-leaf-tr')) continue
    text += child.textContent ?? ''
  }
  return normalizeText(text)
}

export function extractBlocks(root: ParentNode): TextBlock[] {
  const nodes = root.querySelectorAll('p, li, h1, h2, h3, h4, blockquote')
  const blocks: TextBlock[] = []
  let i = 0
  for (const node of nodes) {
    if (node.nodeType !== 1) continue
    if (node.getAttribute('data-leaf-tr')) continue
    if (node.classList.contains('leaf-tr')) continue
    if (SKIP.has(node.tagName)) continue
    if (node.closest('.leaf-tr')) continue
    const text = ownText(node)
    if (text.length < 2) continue
    const id = node.getAttribute('data-leaf-id') ?? `b${i}`
    node.setAttribute('data-leaf-id', id)
    blocks.push({ id, tag: node.tagName.toLowerCase(), text })
    i += 1
  }
  return blocks
}

export function joinForDetect(blocks: TextBlock[], limit = 8): string {
  return blocks
    .slice(0, limit)
    .map((b) => b.text)
    .join('\n')
}

export function parseHtmlBlocks(html: string): TextBlock[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return extractBlocks(doc.body)
}
