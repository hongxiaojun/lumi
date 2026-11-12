/**
 * Cloud and Azure clips are blob URLs. HomePod and Apple TV cannot fetch those,
 * and WebKit otherwise hands the address over and keeps the progress bar moving
 * in silence. The clip stays in this page; the system audio route carries it.
 */
let element: HTMLAudioElement | null = null
let wantPlay = false
let revives = 0

export function localRouteElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (!element) {
    const el = document.createElement('audio')
    el.preload = 'auto'
    el.setAttribute('playsinline', '')
    el.disableRemotePlayback = true
    el.dataset.leafRoute = 'local-airplay'
    el.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none'
    el.onpause = () => {
      if (!wantPlay || revives >= 1) return
      revives += 1
      void el.play().catch(() => {
        wantPlay = false
      })
    }
    document.body?.appendChild(el)
    element = el
  }
  return element
}

/** The next play is one the reader asked for, so a route change may start it again once. */
export function holdLocalRoute(): void {
  revives = 0
  wantPlay = true
}

/** A pause the reader asked for, including the gap between sentences, stays paused. */
export function dropLocalRoute(): void {
  wantPlay = false
}
