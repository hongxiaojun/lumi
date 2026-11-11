/** Fitted to the device width. Pinch and double-tap must not scale it again. */
export const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

function blockGesture(event: Event): void {
  event.preventDefault()
}

/** One scale for this document: the device width, and no gesture zoom. */
export function lockDocumentScale(doc: Document): void {
  const root = doc.documentElement
  if (!root || root.dataset.leafScale === 'locked') return
  root.dataset.leafScale = 'locked'
  let head = doc.head
  if (!head) {
    head = doc.createElement('head')
    root.insertBefore(head, root.firstChild)
  }
  for (const node of [...head.querySelectorAll('meta')]) {
    if (node.getAttribute('name')?.toLowerCase() === 'viewport') node.remove()
  }
  const meta = doc.createElement('meta')
  meta.setAttribute('name', 'viewport')
  meta.setAttribute('content', LOCKED_VIEWPORT)
  head.insertBefore(meta, head.firstChild)
  root.style.setProperty('touch-action', 'pan-x pan-y', 'important')
  root.style.setProperty('-webkit-text-size-adjust', '100%', 'important')
  doc.addEventListener('gesturestart', blockGesture, { passive: false })
  doc.addEventListener('gesturechange', blockGesture, { passive: false })
}
