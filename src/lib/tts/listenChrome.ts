/** How much of the in-book listen dock is on screen. None of these stop the audio. */
export type ListenChrome = 'open' | 'mini' | 'hidden'

export type ListenChromeAction = 'collapse' | 'close' | 'expand'

/**
 * Collapse minimizes the dock. Close only hides that window.
 * Expand brings the full controls back. Playback is unchanged.
 */
export function nextListenChrome(current: ListenChrome, action: ListenChromeAction): ListenChrome {
  if (action === 'close') return 'hidden'
  if (action === 'expand') return 'open'
  if (current === 'hidden') return 'hidden'
  return 'mini'
}
