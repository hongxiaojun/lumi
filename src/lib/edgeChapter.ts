const MAX_BLOB = 1_500_000

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function readBlobUrl(url: string): Promise<string | null> {
  return fetch(url)
    .then(async (res) => {
      if (!res.ok) return null
      const blob = await res.blob()
      if (blob.size > MAX_BLOB) return null
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    })
    .catch(() => null)
}

/** Edge reads the words. A data-url font file is what blows the chapter past the size limit. */
function dropEmbeddedFonts(css: string): string {
  return css.replace(/@font-face\s*\{[^}]*\}/gi, (block) => (/url\(\s*["']?data:/i.test(block) ? '' : block))
}

function stripActive(root: Element) {
  root.querySelectorAll('script, iframe, object, embed, base').forEach((el) => el.remove())
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      if ((name === 'href' || name === 'src' || name === 'srcset') && value.startsWith('javascript:')) {
        el.removeAttribute(attr.name)
      }
    }
  }
}

let liveChapter: { doc: Document; url: string } | null = null

/** The book frame sits in a closed shadow root, so the page cannot see its iframe. */
export function rememberChapter(doc: Document | null, url = ''): void {
  if (!doc?.documentElement) {
    liveChapter = null
    return
  }
  liveChapter = { doc, url }
}

export function frameDocument(url: string, root: ParentNode = document): Document | null {
  for (const frame of root.querySelectorAll('iframe')) {
    if (frame.src === url) return frame.contentDocument
  }
  const live = liveChapter
  if (!live?.doc.documentElement || !url) return null
  if (url === live.url) return live.doc
  if (url.startsWith('blob:') && (live.url === '' || live.url.startsWith('blob:'))) return live.doc
  return null
}

export async function chapterHtmlForEdge(
  doc: Document,
  readBlob: (url: string) => Promise<string | null> = readBlobUrl,
): Promise<string> {
  const source = doc.documentElement
  if (!source) return ''
  const clone = source.cloneNode(true) as HTMLElement
  stripActive(clone)
  for (const style of clone.querySelectorAll('style')) {
    if (style.textContent) style.textContent = dropEmbeddedFonts(style.textContent)
  }
  let head = clone.querySelector('head')
  if (!head) {
    head = doc.createElement('head')
    clone.insertBefore(head, clone.firstChild)
  }
  if (!head.querySelector('meta[charset]')) {
    const meta = doc.createElement('meta')
    meta.setAttribute('charset', 'utf-8')
    head.insertBefore(meta, head.firstChild)
  }
  for (const img of clone.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    if (!src.startsWith('blob:')) continue
    const data = await readBlob(src)
    if (data?.startsWith('data:')) img.setAttribute('src', data)
    else img.removeAttribute('src')
    if (img.getAttribute('srcset')?.includes('blob:')) img.removeAttribute('srcset')
  }
  return `<!DOCTYPE html>\n${clone.outerHTML}`
}

export async function openClickedFrame(
  url: string,
  onStatus: (message: string) => void,
  find: (url: string) => Document | null = (frameUrl) => frameDocument(frameUrl),
): Promise<void> {
  const doc = find(url)
  if (!doc?.documentElement) {
    onStatus('这一页打不开')
    return
  }
  try {
    const html = await chapterHtmlForEdge(doc)
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_chapter_in_edge', { html })
  } catch (error) {
    const message = typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '这台 Mac 上没有找到 Microsoft Edge'
    onStatus(message)
  }
}

export async function subscribeOpenFrame(onStatus: (message: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  const unlistenFrame = await listen<string>('leaf-open-frame', (event) => {
    void openClickedFrame(event.payload ?? '', onStatus)
  })
  const unlistenStatus = await listen<string>('leaf-open-frame-status', (event) => {
    if (event.payload) onStatus(event.payload)
  })
  return () => {
    unlistenFrame()
    unlistenStatus()
  }
}
