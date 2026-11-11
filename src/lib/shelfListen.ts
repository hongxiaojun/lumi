import type { PlaybackState } from './tts/player'

/** What the shelf player can show without mounting the book on screen. */
export type ShelfPlayback = {
  bookId: string
  active: boolean
  phase: PlaybackState
  text: string
  error: string | null
}

export function samePlayback(prev: ShelfPlayback | null, next: ShelfPlayback | null): boolean {
  if (prev === next) return true
  if (!prev || !next) return false
  return prev.bookId === next.bookId
    && prev.active === next.active
    && prev.phase === next.phase
    && prev.text === next.text
    && prev.error === next.error
}

/** Pause the book already speaking. Anything else starts that book. */
export function shelfPlayAction(
  bookId: string,
  playback: { bookId: string; active: boolean } | null | undefined,
): 'toggle' | 'open' {
  if (playback?.active && playback.bookId === bookId) return 'toggle'
  return 'open'
}

/** The sentence under the shelf player. Empty when nothing is being read. */
export function spokenLine(playback: ShelfPlayback | null | undefined): string {
  if (!playback?.active) return ''
  if (playback.phase === 'error') return playback.error?.trim() || '朗读没有出声'
  const text = playback.text.trim()
  if (text) return text
  if (playback.phase === 'paused') return '已暂停'
  if (playback.phase === 'done') return playback.error?.trim() || '这一章读完了'
  if (playback.phase === 'loading') return '正在准备…'
  return '正在朗读'
}
