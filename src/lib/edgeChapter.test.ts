import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const listen = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => listen(...args) }))

import { chapterHtmlForEdge, frameDocument, openClickedFrame, rememberChapter, subscribeOpenFrame } from './edgeChapter'

function setTauri(on: boolean) {
  const host = window as unknown as Record<string, unknown>
  if (on) host.__TAURI_INTERNALS__ = {}
  else delete host.__TAURI_INTERNALS__
}

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument('章')
  doc.body.innerHTML = html
  return doc
}

beforeEach(() => {
  invoke.mockReset()
  listen.mockReset()
  setTauri(false)
  document.body.innerHTML = ''
  rememberChapter(null)
})

describe('edge chapter', () => {
  it('keeps the words and drops scripts, frames, and click handlers', async () => {
    const doc = docWith(
      '<script>alert(1)</script><iframe src="https://evil.test"></iframe><object></object><embed></embed><p onclick="alert(1)">正文</p><a href="javascript:alert(1)">链接</a>',
    )
    const html = await chapterHtmlForEdge(doc, async () => null)
    expect(html).toContain('正文')
    expect(html).toContain('链接')
    expect(html).not.toContain('alert')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<object')
    expect(html).not.toContain('<embed')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('charset="utf-8"')
  })

  it('inlines a blob image, drops a blob that cannot be read, and leaves https', async () => {
    const doc = docWith(
      '<img src="blob:http://localhost/a" alt="图"><img src="blob:http://localhost/missing" alt="缺"><img src="https://example.test/a.jpg" alt="网">',
    )
    const html = await chapterHtmlForEdge(doc, async (url) =>
      url.endsWith('/a') ? 'data:image/gif;base64,qq' : null,
    )
    expect(html).toContain('src="data:image/gif;base64,qq"')
    expect(html).toContain('src="https://example.test/a.jpg"')
    expect(html).toContain('alt="缺"')
    expect(html).not.toContain('blob:')
  })

  it('leaves out embedded font files and keeps a font already on this Mac', async () => {
    const doc = docWith('<p>第一条军规</p>')
    const style = doc.createElement('style')
    const payload = 'A'.repeat(50_000)
    style.textContent = [
      '@font-face{font-family:"leaf-body";src:local("仓耳今楷")}',
      `@font-face{font-family:"big";src:url(data:font/ttf;base64,${payload})}`,
      'p{line-height:1.9}',
    ].join('')
    doc.head.append(style)
    const html = await chapterHtmlForEdge(doc, async () => null)
    expect(html).toContain('第一条军规')
    expect(html).toContain('local("仓耳今楷")')
    expect(html).toContain('line-height:1.9')
    expect(html).not.toContain('data:font')
    expect(html).not.toContain(payload)
    expect(html.length).toBeLessThan(8_000)
  })

  it('finds the frame with that address', () => {
    document.body.innerHTML = '<iframe id="book"></iframe>'
    const frame = document.getElementById('book') as HTMLIFrameElement
    frame.src = 'blob:http://localhost/chapter'
    expect(frameDocument('blob:http://localhost/chapter', document)).toBe(frame.contentDocument)
    expect(frameDocument('blob:http://localhost/other', document)).toBeNull()
  })

  it('sends that frame to Edge', async () => {
    const doc = docWith('<p>余华</p>')
    invoke.mockResolvedValue(undefined)
    await openClickedFrame('blob:http://localhost/chapter', () => {}, () => doc)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][0]).toBe('open_chapter_in_edge')
    expect(invoke.mock.calls[0][1].html).toContain('余华')
  })

  it('opens the live chapter when its frame is hidden from the page', async () => {
    const doc = docWith('<p>余华</p>')
    rememberChapter(doc, 'blob:tauri://localhost/chapter')
    invoke.mockResolvedValue(undefined)
    await openClickedFrame('blob:null/other', () => {})
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][1].html).toContain('余华')
  })

  it('does not send the live chapter for an ordinary web address', async () => {
    rememberChapter(docWith('<p>余华</p>'), 'blob:tauri://localhost/chapter')
    const onStatus = vi.fn()
    await openClickedFrame('https://example.test/a', onStatus)
    expect(onStatus).toHaveBeenCalledWith('这一页打不开')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not open the live chapter for an empty address', async () => {
    rememberChapter(docWith('<p>余华</p>'), 'blob:tauri://localhost/chapter')
    const onStatus = vi.fn()
    await openClickedFrame('', onStatus)
    expect(onStatus).toHaveBeenCalledWith('这一页打不开')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not open a chapter after it is forgotten', async () => {
    rememberChapter(docWith('<p>余华</p>'), 'blob:tauri://localhost/chapter')
    rememberChapter(null)
    const onStatus = vi.fn()
    await openClickedFrame('blob:null/other', onStatus)
    expect(onStatus).toHaveBeenCalledWith('这一页打不开')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('says the page cannot be opened when the frame is gone', async () => {
    const onStatus = vi.fn()
    await openClickedFrame('blob:http://localhost/missing', onStatus, () => null)
    expect(onStatus).toHaveBeenCalledWith('这一页打不开')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('shows the Edge message when the app cannot launch it', async () => {
    const doc = docWith('<p>余华</p>')
    invoke.mockRejectedValue('这台 Mac 上没有找到 Microsoft Edge')
    const onStatus = vi.fn()
    await openClickedFrame('blob:http://localhost/chapter', onStatus, () => doc)
    expect(onStatus).toHaveBeenCalledWith('这台 Mac 上没有找到 Microsoft Edge')
  })

  it('listens for the frame menu only inside the app', async () => {
    expect(await subscribeOpenFrame(() => {})).toBeTypeOf('function')
    expect(listen).not.toHaveBeenCalled()
    setTauri(true)
    listen.mockResolvedValue(() => {})
    await subscribeOpenFrame(() => {})
    expect(listen.mock.calls.map((call) => call[0])).toEqual(['leaf-open-frame', 'leaf-open-frame-status'])
  })
})
