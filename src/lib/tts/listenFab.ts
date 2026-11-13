import type { PlaybackState } from './player'
import type { ListenChrome } from './listenChrome'

/** The round button is absent while the full player is on screen. */
export type ListenFabMode = 'off' | 'idle' | 'live' | 'held'

/** Same metals as the home medals: gray at rest, silver when paused, gold while speaking. */
export type ListenFabMetal = 'none' | 'silver' | 'gold'

export function listenFabMetal(mode: Exclude<ListenFabMode, 'off'>): ListenFabMetal {
  if (mode === 'live') return 'gold'
  if (mode === 'held') return 'silver'
  return 'none'
}

/**
 * Idle starts narration. Live and held keep the audio in the background
 * and open the player again. Live is the moving state.
 */
export function listenFabMode(input: {
  active: boolean
  chrome: ListenChrome
  phase: PlaybackState
}): ListenFabMode {
  if (input.active && input.chrome === 'open') return 'off'
  if (!input.active) return 'idle'
  if (input.phase === 'playing' || input.phase === 'loading') return 'live'
  return 'held'
}
