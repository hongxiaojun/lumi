/**
 * Chapter-boundary prefetch. The player's own lookahead stops at the last
 * sentence of a chapter, so the turn into the next chapter used to wait on a
 * full network round trip. While the current chapter plays its last two
 * sentences, peek at the next chapter and warm the cloud cache with its first
 * sentences. Best-effort: any failure falls back to the old on-demand fetch.
 */

/** True once the player reaches either of the last two sentences. */
export function shouldPrefetchNextChapter(unitIndex: number, total: number): boolean {
  return total > 0 && unitIndex >= total - 2
}

/**
 * Runs one peek per chapter, at most. `peek` returns the next chapter's
 * sentences (or null when there is no next chapter); `prefetch` warms the
 * cache. A failed peek is swallowed and not retried within the chapter.
 */
export function createChapterPrefetcher(
  peek: () => Promise<readonly string[] | null>,
  prefetch: (texts: readonly string[]) => void,
): { maybe: (unitIndex: number, total: number) => void } {
  let done = false
  return {
    maybe(unitIndex: number, total: number) {
      if (done || !shouldPrefetchNextChapter(unitIndex, total)) return
      done = true
      void peek()
        .then((units) => {
          if (units && units.length > 0) prefetch(units.slice(0, 2))
        })
        .catch(() => {})
    },
  }
}
