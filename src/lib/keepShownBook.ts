/** A second disk read builds a new File and restarts the reader. Keep the book already on screen. */
export function keepShownBook<T extends { id: string }>(
  shown: T | null,
  openId: string,
  loaded: T | null,
): T | null {
  if (shown?.id === openId) return shown
  return loaded
}
