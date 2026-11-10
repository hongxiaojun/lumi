import type { TtsConfig } from '../../types'
import { pickVoice } from './config'
import { nativeSpeaker } from './native'
import type { SpeakHandle, Speaker } from './types'

export type SystemVoice = {
  id: string
  name: string
  lang: string
  local: boolean
}

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  return window.speechSynthesis
}

export function systemVoices(): SystemVoice[] {
  const engine = synth()
  if (!engine) return []
  try {
    return engine
      .getVoices()
      .map((voice) => ({
        id: voice.voiceURI || voice.name,
        name: voice.name,
        lang: voice.lang,
        local: voice.localService,
      }))
      .sort((a, b) => Number(b.local) - Number(a.local) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function subscribeSystemVoices(listener: () => void): () => void {
  const engine = synth()
  if (!engine) return () => {}
  engine.addEventListener('voiceschanged', listener)
  return () => engine.removeEventListener('voiceschanged', listener)
}

function voiceFor(config: TtsConfig, lang: string): SpeechSynthesisVoice | null {
  const engine = synth()
  if (!engine) return null
  let voices: SpeechSynthesisVoice[] = []
  try {
    voices = engine.getVoices()
  } catch {
    return null
  }
  const choice = pickVoice(
    voices.map((voice) => ({ id: voice.voiceURI || voice.name, lang: voice.lang, voice })),
    config.systemVoice,
    lang,
  )
  return choice?.voice ?? null
}

export function systemSpeaker(config: TtsConfig, lang: string): Speaker {
  // WKWebView fires the Web Speech events but stays silent on the device, so
  // the Tauri shell (iPhone and desktop) hands the sentence to AVSpeechSynthesizer.
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return nativeSpeaker(config, lang)
  }
  return webSpeaker(config, lang)
}

function webSpeaker(config: TtsConfig, lang: string): Speaker {
  return (unit, handlers): SpeakHandle => {
    const engine = synth()
    if (!engine) {
      queueMicrotask(() => handlers.onError(new Error('这台设备没有系统朗读，请改用云端语音')))
      return { cancel: () => {} }
    }
    let cancelled = false
    let started = false
    const utterance = new SpeechSynthesisUtterance(unit.text)
    const voice = voiceFor(config, lang)
    utterance.lang = voice?.lang ?? lang
    if (voice) utterance.voice = voice
    utterance.rate = config.rate
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onstart = () => {
      if (cancelled) return
      started = true
      handlers.onStart()
    }
    utterance.onboundary = (event) => {
      if (cancelled || !handlers.onBoundary) return
      handlers.onBoundary(event.charIndex ?? 0, event.charLength ?? 0)
    }
    utterance.onend = () => {
      if (cancelled) return
      if (!started) handlers.onStart()
      handlers.onEnd()
    }
    utterance.onerror = (event) => {
      if (cancelled) return
      const reason = event.error === 'interrupted' || event.error === 'canceled' ? null : event.error
      if (reason === null) {
        handlers.onEnd()
        return
      }
      handlers.onError(new Error(reason === 'not-allowed' ? '系统朗读被浏览器拦住了，请点一下播放' : '系统朗读没有出声'))
    }
    // Chrome keeps the previous utterance's events alive across cancel(). A fresh
    // cancel before speak keeps the newest sentence from queueing behind it.
    engine.cancel()
    engine.speak(utterance)
    return {
      cancel() {
        cancelled = true
        utterance.onstart = null
        utterance.onboundary = null
        utterance.onend = null
        utterance.onerror = null
        engine.cancel()
      },
      pause() {
        if (cancelled) return false
        engine.pause()
        return true
      },
      resume() {
        if (cancelled) return false
        engine.resume()
        return true
      },
    }
  }
}
