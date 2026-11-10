import { useCallback, useEffect, useRef, useState } from 'react'
import type { TtsConfig } from '../types'
import type { ListenChapter, ReaderApi } from './FoliateHost'
import { azureSpeaker, prefetchAzureSpeech } from '../lib/tts/azure'
import { cloudSpeaker, prefetchSpeech, unlockAudio } from '../lib/tts/cloud'
import { createChapterPrefetcher } from '../lib/tts/chapterPrefetch'
import { speechLang } from '../lib/tts/config'
import { SpeechPlayer, type PlaybackState } from '../lib/tts/player'
import { wordAt, type SpeechUnit } from '../lib/tts/speech'
import { systemSpeaker } from '../lib/tts/system'
import type { Speaker, SpeakHandle } from '../lib/tts/types'

export type ReadAloudView = {
  active: boolean
  phase: PlaybackState
  index: number
  total: number
  text: string
  error: string | null
  start: (range?: Range | null) => void
  stop: () => void
  toggle: () => void
  next: () => void
  previous: () => void
  repaint: () => void
}

type Ui = {
  active: boolean
  phase: PlaybackState
  index: number
  total: number
  text: string
  error: string | null
}

const IDLE: Ui = { active: false, phase: 'idle', index: 0, total: 0, text: '', error: null }

type Current = { chapter: ListenChapter; unit: SpeechUnit; word: { text: string; offset: number } | null }

export function useReadAloud({
  nav,
  tts,
}: {
  nav: ReaderApi | null
  tts: TtsConfig
}): ReadAloudView {
  const [ui, setUi] = useState<Ui>(IDLE)
  const navRef = useRef(nav)
  const ttsRef = useRef(tts)
  const activeRef = useRef(false)
  const playerRef = useRef<SpeechPlayer | null>(null)
  const chapterRef = useRef<ListenChapter | null>(null)
  const currentRef = useRef<Current | null>(null)
  const advanceToken = useRef(0)
  const emptyStreak = useRef(0)
  const retryTimer = useRef<number | null>(null)
  navRef.current = nav
  ttsRef.current = tts

  const clearRetry = useCallback(() => {
    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }, [])

  const paint = useCallback((current: Current, follow: boolean, attempt = 0) => {
    if (!activeRef.current || currentRef.current !== current) return
    if (current.chapter.paint(current.unit, current.word, follow)) return
    if (attempt >= 6) return
    clearRetry()
    retryTimer.current = window.setTimeout(() => paint(current, follow, attempt + 1), 100)
  }, [clearRetry])

  const finishChapter = useCallback(async () => {
    const navNow = navRef.current
    if (!navNow) return
    const token = ++advanceToken.current
    setUi((prev) => ({ ...prev, phase: 'loading', error: null }))
    const advanced = await navNow.listenNext()
    if (token !== advanceToken.current || !activeRef.current) return
    if (!advanced) {
      setUi((prev) => ({ ...prev, phase: 'done', error: '全书读完了。' }))
    }
  }, [])

  const speak: Speaker = useCallback((unit, handlers, upcoming): SpeakHandle => {
    const config = ttsRef.current
    const chapter = chapterRef.current
    const lang = chapter?.lang ?? speechLang(undefined, unit.text)
    if (config.provider === 'cloud') return cloudSpeaker(config)(unit, handlers, upcoming)
    if (config.provider === 'azure') return azureSpeaker(config)(unit, handlers, upcoming)
    return systemSpeaker(config, lang)(unit, handlers, upcoming)
  }, [])

  /** Warm the cloud or Azure cache; system voices speak locally, nothing to warm. */
  const warmCache = useCallback((texts: readonly string[]) => {
    const config = ttsRef.current
    if (config.provider === 'cloud') void prefetchSpeech(texts, config)
    if (config.provider === 'azure') void prefetchAzureSpeech(texts, config)
  }, [])

  const beginChapter = useCallback((chapter: ListenChapter, startAt = 0) => {
    if (!activeRef.current) return
    advanceToken.current += 1
    chapterRef.current = chapter
    currentRef.current = null
    clearRetry()
    playerRef.current?.stop()
    playerRef.current = null
    if (chapter.units.length === 0) {
      if (emptyStreak.current >= 3) {
        setUi((prev) => ({ ...prev, phase: 'done', error: '这一章没有可朗读的文字。' }))
        return
      }
      emptyStreak.current += 1
      void finishChapter()
      return
    }
    emptyStreak.current = 0
    // While the last two sentences play, warm the cloud or Azure cache with the
    // next chapter's opening sentences so the chapter turn has no loading gap.
    const prefetcher = createChapterPrefetcher(
      async () => {
        if (ttsRef.current.provider === 'system') return null
        return navRef.current?.listenPeek() ?? null
      },
      warmCache,
    )
    const player = new SpeechPlayer(chapter.units, speak, {
      onState: (phase, error) => {
        setUi((prev) => ({
          ...prev,
          active: true,
          phase,
          error: error ?? (phase === 'playing' || phase === 'loading' ? null : prev.error),
        }))
      },
      onUnit: (index) => {
        const unit = chapter.units[index]
        if (!unit) return
        prefetcher.maybe(index, chapter.units.length)
        const current: Current = { chapter, unit, word: null }
        currentRef.current = current
        setUi((prev) => ({ ...prev, index, text: unit.text }))
        paint(current, true)
      },
      onBoundary: (index, charIndex, charLength) => {
        const unit = chapter.units[index]
        if (!unit) return
        const word = wordAt(unit.text, charIndex, charLength)
        const current: Current = { chapter, unit, word }
        currentRef.current = current
        paint(current, false)
      },
      onDone: () => {
        void finishChapter()
      },
    })
    playerRef.current = player
    setUi((prev) => ({
      ...prev,
      active: true,
      phase: 'loading',
      index: startAt,
      total: chapter.units.length,
      text: chapter.units[startAt]?.text ?? '',
    }))
    player.start(startAt)
  }, [clearRetry, finishChapter, paint, speak, warmCache])

  const start = useCallback((range?: Range | null) => {
    if (activeRef.current) return
    const navNow = navRef.current
    if (!navNow) return
    const chapter = navNow.listenChapter()
    if (!chapter) return
    if (ttsRef.current.provider !== 'system') unlockAudio()
    activeRef.current = true
    setUi({ ...IDLE, active: true, phase: 'loading' })
    beginChapter(chapter, chapter.startIndex(range ?? null))
  }, [beginChapter])

  const stop = useCallback(() => {
    activeRef.current = false
    advanceToken.current += 1
    clearRetry()
    playerRef.current?.stop()
    playerRef.current = null
    const current = currentRef.current
    currentRef.current = null
    chapterRef.current = null
    current?.chapter.clear()
    setUi(IDLE)
  }, [clearRetry])

  const toggle = useCallback(() => {
    const player = playerRef.current
    if (!activeRef.current || !player) {
      start()
      return
    }
    if (player.state === 'playing' || player.state === 'loading') {
      player.pause()
      return
    }
    if (player.state === 'paused') {
      player.resume()
      return
    }
    stop()
    start()
  }, [start, stop])

  const next = useCallback(() => {
    const player = playerRef.current
    if (!player) {
      start()
      return
    }
    player.next()
  }, [start])

  const previous = useCallback(() => {
    playerRef.current?.previous()
  }, [])

  const repaint = useCallback(() => {
    const current = currentRef.current
    if (current) paint(current, false)
  }, [paint])

  useEffect(() => {
    if (!nav) return
    return nav.onListenChapter((chapter) => {
      if (!activeRef.current) return
      if (chapterRef.current === chapter) return
      beginChapter(chapter)
    })
  }, [nav, beginChapter])

  useEffect(() => {
    const current = currentRef.current
    if (!activeRef.current || !current) return
    paint(current, false)
  }, [tts.listenLayout, paint])

  useEffect(() => () => {
    activeRef.current = false
    clearRetry()
    playerRef.current?.stop()
    currentRef.current?.chapter.clear()
  }, [clearRetry])

  return { ...ui, start, stop, toggle, next, previous, repaint }
}
