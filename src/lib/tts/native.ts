import type { TtsConfig } from '../../types'
import { clampRate } from './config'
import type { SpeakHandle, Speaker } from './types'

type TtsModule = typeof import('tauri-plugin-tts-api')
type SpeechEvent = { id?: string; error?: string; eventType?: string }

/**
 * The plugin only loads inside Tauri; the browser dev server falls back to the
 * Web Speech API in system.ts. The module (and its event subscriptions) is
 * cached, so the native engine is subscribed to exactly once.
 */
let cached: Promise<TtsModule | null> | null = null
const sinks = new Set<(event: SpeechEvent) => void>()

function plugin(): Promise<TtsModule | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return Promise.resolve(null)
  cached ??= import('tauri-plugin-tts-api').then(async (mod) => {
    // speech:pause with route_change is the headphone fallback. AirPlay does not
    // pause, so resuming here would start the phone speaker after the headphones come out.
    for (const type of ['speech:start', 'speech:finish', 'speech:cancel', 'speech:error'] as const) {
      await mod.onSpeechEvent(type, (event) => {
        const payload: SpeechEvent = { id: event.id, error: event.error, eventType: type }
        for (const sink of sinks) sink(payload)
      })
    }
    return mod
  }).catch(() => null)
  return cached
}

/** Test hook: forget the cached module and its subscriptions. */
export function resetNativeTts(): void {
  cached = null
  sinks.clear()
}

/** iOS can pause the engine; macOS and Android report success: false. */
function pauseSupported(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
}

export function nativeSpeaker(config: TtsConfig, lang: string): Speaker {
  return (unit, handlers): SpeakHandle => {
    let cancelled = false
    let started = false
    let utteranceId: string | null = null

    const sink = (event: SpeechEvent): void => {
      if (cancelled) return
      if (event.id && utteranceId && event.id !== utteranceId) return
      if (event.eventType === 'speech:start') {
        if (!started) {
          started = true
          handlers.onStart()
        }
        return
      }
      if (event.eventType === 'speech:finish') {
        if (started) handlers.onEnd()
        else {
          started = true
          handlers.onStart()
          handlers.onEnd()
        }
        return
      }
      if (event.eventType === 'speech:error') {
        handlers.onError(new Error(event.error ? `系统朗读没有出声：${event.error}` : '系统朗读没有出声'))
      }
    }

    void plugin().then(async (mod) => {
      if (!mod) {
        if (!cancelled) handlers.onError(new Error('这台设备没有原生朗读'))
        return
      }
      sinks.add(sink)
      try {
        const result = await mod.speak({
          text: unit.text,
          language: lang || null,
          rate: clampRate(config.rate),
          pitch: 1,
          volume: 1,
        })
        if (cancelled) return
        utteranceId = result.utteranceId ?? null
        if (result.warning) console.warn('native tts voice fallback:', result.warning)
      } catch (error) {
        sinks.delete(sink)
        if (cancelled) return
        const message = error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : '系统朗读没有出声'
        handlers.onError(new Error(message))
      }
    })

    return {
      cancel() {
        cancelled = true
        sinks.delete(sink)
        void plugin().then((mod) => {
          if (mod) void mod.stop().catch(() => {})
        })
      },
      pause() {
        if (!pauseSupported() || cancelled) return false
        void plugin().then((mod) => {
          if (mod) void mod.pauseSpeaking().catch(() => {})
        })
        return true
      },
      resume() {
        if (!pauseSupported() || cancelled) return false
        void plugin().then((mod) => {
          if (mod) void mod.resumeSpeaking().catch(() => {})
        })
        return true
      },
    }
  }
}
