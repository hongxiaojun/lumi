/** Half a viewport of padding, so the first and last sentence can sit in the middle. */
export const LISTEN_BLOCK_PAD = 0.5

/**
 * Scroll offset that places `[top, top + height)` in the middle of `viewport`.
 * The paginator uses the same formula for the spoken sentence.
 */
export function centerScrollOffset(top: number, height: number, viewport: number): number {
  if (!(viewport > 0)) return Math.max(0, top)
  const span = Math.max(0, height)
  return Math.max(0, top - (viewport - span) / 2)
}

export function listenBlockPad(viewport: number): number {
  if (!(viewport > 0)) return 0
  return Math.round(viewport * LISTEN_BLOCK_PAD)
}
