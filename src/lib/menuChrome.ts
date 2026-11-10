export type MenuVisibility = {
  pointer: boolean
  pinned: boolean
  panel: boolean
}

/** The bar is up when the pointer is on it, a touch tap pinned it, or a panel is open. */
export function menuShown(state: MenuVisibility): boolean {
  return state.pointer || state.pinned || state.panel
}

/**
 * A tap on the page text. A mouse never raises the bar. A touch toggles it,
 * and a tap that closes a panel also puts the bar away.
 */
export function pageMenuPinned(input: {
  touch: boolean
  panel: boolean
  pinned: boolean
}): boolean {
  if (!input.touch) return input.pinned
  if (input.panel) return false
  return !input.pinned
}

/** Touch has no hover, so a finger on the top strip must not pin the bar open. */
export function pointerHoldsMenu(pointerType: string): boolean {
  return pointerType !== 'touch'
}

/**
 * A menu button runs on pointer-up. iOS often drops the click that follows a
 * touch, and a click that arrives after the panel opens lands on the scrim
 * and closes it. preventDefault stops that second click.
 */
export function menuPress(
  event: { pointerType: string; button?: number; preventDefault: () => void },
  run: () => void,
): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  run()
}
