/**
 * How much of the layout viewport the on-screen keyboard covers. `innerHeight`
 * does not shrink on iOS; the visual viewport does, and may also pan.
 */
export function keyboardInset(innerHeight: number, visualHeight: number, offsetTop = 0): number {
  if (![innerHeight, visualHeight, offsetTop].every(Number.isFinite)) return 0
  return Math.max(0, Math.round(innerHeight - visualHeight - offsetTop))
}
