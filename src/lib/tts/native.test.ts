import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTS } from './config'

const speakCalls: Array<Record<string, unknown>> = []
const stopCalls = vi.fn()
const pauseCalls = vi.fn()
const resumeCalls = vi.fn()
type Emit = (event: Record<string, unknown>) => void
const emitters = new Map<string, Emit>()

vi.mock('tauri-plugin-tts-api', () => ({
  speak: (options: Record<string, unknown>) => {
    speakCalls.push(options)
    return Promise.resolve({ utteranceId: `utt-${speakCalls.length}`, warning: null })
  },
  stop: () => {
    stopCalls()
    return Promise.resolve()
  },
  pauseSpeaking: () => {
    pauseCalls()
    return Promise.resolve({ success: true, reason: null })
  },
  resumeSpeaking: () => {
    resumeCalls()
    return Promise.resolve({ success: true, reason: null })
  },
  onSpeechEvent: (eventType: string, handler: (event: Record<string, unknown>) => void) => {
    emitters.set(eventType, handler)
    return Promise.resolve(() => {})
  },
}))

import { nativeSpeaker, resetNativeTts } from './native'
import type { SpeechUnit } from './speech'
import type { SpeakHandlers } from './types'

const UNIT: SpeechUnit = { blockIndex: 0, text: '一句要读的话。', start: 0, occurrence: 0 }

function handlers() {
  const h = { onStart: vi.fn(), onBoundary: vi.fn(), onEnd: vi.fn(), onError: vi.fn() }
  return h as h & SpeakHandlers
}

function tauriWindow(on: boolean) {
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; navigator: Navigator }
  Object.defineProperty(w.navigator, 'userAgent', { value: 'iPhone', configurable: true })
  if (on) w.__TAURI_INTERNALS__ = {}
  else delete w.__TAURI_INTERNALS__
}

async function flushed(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  speakCalls.length = 0
  emitters.clear()
  stopCalls.mockClear()
  pauseCalls.mockClear()
  resumeCalls.mockClear()
  resetNativeTts()
  tauriWindow(true)
})

describe('nativeSpeaker', () => {
  it('asks the plugin to speak the sentence in the book language', async () => {
    const speaker = nativeSpeaker({ ...DEFAULT_TTS, rate: 1.5 }, 'zh-CN')
    speaker(UNIT, handlers())
    await flushed()
    expect(speakCalls).toHaveLength(1)
    expect(speakCalls[0]).toMatchObject({ text: UNIT.text, language: 'zh-CN', rate: 1.5 })
  })

  it('maps lifecycle events onto the handlers', async () => {
    const h = handlers()
    const speaker = nativeSpeaker(DEFAULT_TTS, 'zh-CN')
    speaker(UNIT, h)
    await flushed()
    emitters.get('speech:start')?.({ id: 'utt-1' })
    emitters.get('speech:finish')?.({ id: 'utt-1' })
    expect(h.onStart).toHaveBeenCalledTimes(1)
    expect(h.onEnd).toHaveBeenCalledTimes(1)
    expect(h.onError).not.toHaveBeenCalled()
  })

  it('raises speech:error as a readable failure', async () => {
    const h = handlers()
    const speaker = nativeSpeaker(DEFAULT_TTS, 'zh-CN')
    speaker(UNIT, h)
    await flushed()
    emitters.get('speech:error')?.({ id: 'utt-1', error: 'engine exploded' })
    expect(h.onError).toHaveBeenCalledTimes(1)
    expect(String(h.onError.mock.calls[0][0])).toContain('engine exploded')
  })

  it('ignores events for other utterances and after cancel', async () => {
    const h = handlers()
    const speaker = nativeSpeaker(DEFAULT_TTS, 'zh-CN')
    const handle = speaker(UNIT, h)
    await flushed()
    emitters.get('speech:start')?.({ id: 'utt-99' })
    expect(h.onStart).not.toHaveBeenCalled()
    handle.cancel()
    await flushed()
    expect(stopCalls).toHaveBeenCalled()
    emitters.get('speech:start')?.({ id: 'utt-1' })
    emitters.get('speech:finish')?.({ id: 'utt-1' })
    expect(h.onStart).not.toHaveBeenCalled()
    expect(h.onEnd).not.toHaveBeenCalled()
  })

  it('pauses and resumes through the engine on iOS', async () => {
    const speaker = nativeSpeaker(DEFAULT_TTS, 'zh-CN')
    const handle = speaker(UNIT, handlers())
    await flushed()
    expect(handle.pause?.()).toBe(true)
    await flushed()
    expect(handle.resume?.()).toBe(true)
    await flushed()
    expect(pauseCalls).toHaveBeenCalled()
    expect(resumeCalls).toHaveBeenCalled()
  })

  it('reports unavailable when there is no Tauri runtime', async () => {
    tauriWindow(false)
    const h = handlers()
    const speaker = nativeSpeaker(DEFAULT_TTS, 'zh-CN')
    speaker(UNIT, h)
    await flushed()
    expect(speakCalls).toHaveLength(0)
    expect(h.onError).toHaveBeenCalledTimes(1)
  })
})
