import { useEffect } from 'react'
import { commitVisibleSpan } from '../lib/homeReading'

/** Count foreground time while a book is open. Hidden time is not reading. */
export function useReadingClock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    let from = Date.now()
    let visible = document.visibilityState !== 'hidden'
    const flush = (nextVisible: boolean) => {
      const now = Date.now()
      from = commitVisibleSpan(localStorage, from, now, visible)
      visible = nextVisible
    }
    const onVis = () => flush(document.visibilityState !== 'hidden')
    const timer = window.setInterval(() => {
      if (visible) flush(true)
    }, 15000)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      flush(false)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [active])
}
