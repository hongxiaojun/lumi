import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PHONE_MAX_WIDTH } from './breakpoints'

// A classic scrollbar takes its width out of the webview. If the window can be
// dragged narrow enough that the content lands on the other side of the
// breakpoint, the shelf swaps to the phone layout, that layout is shorter, the
// scrollbar leaves, the width comes back, and the page flickers between the two
// forever. The window minimum has to clear the breakpoint by a scrollbar.
const SCROLLBAR = 16
const root = process.cwd()

describe('narrow window', () => {
  it('cannot drag the window onto the phone breakpoint', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      app: { windows: Array<{ minWidth?: number }> }
    }
    const [window] = config.app.windows
    expect(window.minWidth).toBeGreaterThanOrEqual(PHONE_MAX_WIDTH + SCROLLBAR)
  })

  it('reserves the scrollbar gutter so the content width cannot jump', () => {
    const css = readFileSync(resolve(root, 'src/index.css'), 'utf8')
    expect(css).toMatch(/scrollbar-gutter:\s*stable/)
  })
})
