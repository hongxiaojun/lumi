import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTS } from './config'
import type { SpeakHandle } from './types'

const mocks = vi.hoisted(() => ({ nativeSpeaker: vi.fn() }))

vi.mock('./native', () => ({ nativeSpeaker: mocks.nativeSpeaker }))

const sentinel: SpeakHandle = { cancel: vi.fn() }
// nativeSpeaker(config, lang) hands back a Speaker — the callable that turns
// a unit into a SpeakHandle. The mock must sit at that outer layer.
const speaker = vi.fn(() => sentinel)

beforeEach(() => {
  speaker.mockClear()
  mocks.nativeSpeaker.mockImplementation(() => speaker)
})

import { systemSpeaker } from './system'

function tauriWindow(on: boolean) {
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
  if (on) w.__TAURI_INTERNALS__ = {}
  else delete w.__TAURI_INTERNALS__
}

beforeEach(() => {
  mocks.nativeSpeaker.mockClear()
  tauriWindow(false)
})

describe('systemSpeaker', () => {
  it('delegates to the native engine inside Tauri', () => {
    tauriWindow(true)
    const handle = systemSpeaker(DEFAULT_TTS, 'zh-CN')(
      { blockIndex: 0, text: 'x', start: 0, occurrence: 0 },
      { onStart: () => {}, onEnd: () => {}, onError: () => {} },
    )
    expect(mocks.nativeSpeaker).toHaveBeenCalledTimes(1)
    expect(mocks.nativeSpeaker.mock.calls[0][1]).toBe('zh-CN')
    expect(speaker).toHaveBeenCalledTimes(1)
    expect(handle).toBe(sentinel)
  })

  it('keeps the Web Speech engine in the browser', () => {
    const handle = systemSpeaker(DEFAULT_TTS, 'zh-CN')(
      { blockIndex: 0, text: 'x', start: 0, occurrence: 0 },
      { onStart: () => {}, onEnd: () => {}, onError: () => {} },
    )
    expect(mocks.nativeSpeaker).not.toHaveBeenCalled()
    expect(handle).not.toBe(sentinel)
    handle.cancel()
  })
})
