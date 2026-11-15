/** Debounced progress writer that can be flushed on demand (D-03). */

export type ProgressSaverOptions<T> = {
  /** Debounce window for ordinary page turns. */
  delay?: number
  save: (value: T) => Promise<void>
  /** Called when a write fails. The value is kept for the next flush. */
  onError?: (error: unknown, value: T) => void
}

export type ProgressSaver<T> = {
  /** Hold the newest value; write it once the debounce window elapses. */
  schedule: (value: T) => void
  /** Write whatever is held right now, without waiting for the window. */
  flush: () => Promise<void>
  /** Drop the held value without writing it. */
  cancel: () => void
}

/**
 * One writer, one pending value: later schedules replace earlier ones.
 * Writes are serialized so a slow store cannot reorder two flushes.
 */
export function createProgressSaver<T>({ delay = 400, save, onError }: ProgressSaverOptions<T>): ProgressSaver<T> {
  let timer: number | null = null
  let held: { value: T } | null = null
  let queue: Promise<void> = Promise.resolve()

  const clearTimer = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  const flush = (): Promise<void> => {
    clearTimer()
    const item = held
    held = null
    if (!item) return queue
    queue = queue.then(async () => {
      try {
        await save(item.value)
      } catch (error) {
        // Keep the failed value only if nothing newer arrived meanwhile.
        if (!held) held = item
        onError?.(error, item.value)
      }
    })
    return queue
  }

  const schedule = (value: T) => {
    held = { value }
    clearTimer()
    timer = window.setTimeout(() => {
      timer = null
      void flush()
    }, delay)
  }

  const cancel = () => {
    clearTimer()
    held = null
  }

  return { schedule, flush, cancel }
}
