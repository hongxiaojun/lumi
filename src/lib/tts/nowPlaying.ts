/** What the lock screen card shows. The system draws the buttons; we only name the book. */
export type LockCopy = {
  title: string
  artist: string
  album: string
}

export function lockCopy(input: { title: string; author: string; sentence: string }): LockCopy {
  const title = input.title.trim() || 'Lumi'
  const sentence = input.sentence.trim()
  const author = input.author.trim()
  return {
    title,
    artist: sentence || author || '朗读',
    album: author || title,
  }
}

/**
 * A clock the lock screen can draw.
 * A measured duration shorter than the playhead is the broken bar (0:04 and −0:02).
 * Fall back to the spoken estimate, and never let the duration sit behind the playhead.
 */
export function clipClock(
  current: number,
  duration: number,
  estimate: number,
): { position: number; duration: number } | null {
  const position = Number.isFinite(current) && current > 0 ? current : 0
  const measured = Number.isFinite(duration) && duration > 0 ? duration : 0
  const guess = Number.isFinite(estimate) && estimate > 0 ? estimate : 0
  const trustworthy = measured >= 0.3 && measured + 0.05 >= position
  const length = trustworthy ? measured : Math.max(guess, position)
  if (length <= 0) return null
  const span = Math.max(length, position)
  return { position: Math.min(position, span), duration: span }
}

export type LockArtwork = { src: string; sizes: string; type: string }

const artCache = new WeakMap<Blob, LockArtwork[]>()

export async function artworkOf(cover: Blob | null, coverUrl?: string | null): Promise<LockArtwork[]> {
  if (cover && cover.size > 0) {
    const known = artCache.get(cover)
    if (known) return known
    const made = await artworkFromBlob(cover)
    if (made) {
      artCache.set(cover, made)
      return made
    }
  }
  if (coverUrl && (coverUrl.startsWith('data:') || coverUrl.startsWith('http://') || coverUrl.startsWith('https://'))) {
    return [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }]
  }
  return []
}

async function artworkFromBlob(blob: Blob): Promise<LockArtwork[] | null> {
  const src = await blobToDataUrl(blob)
  if (!src.startsWith('data:image/')) return null
  let sizes = '512x512'
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      if (bitmap.width > 0 && bitmap.height > 0) sizes = `${bitmap.width}x${bitmap.height}`
      bitmap.close()
    } catch {
      // The data URL still works when the decoder cannot report a size.
    }
  }
  const type = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
  return [{ src, sizes, type }]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('cover'))
    reader.readAsDataURL(blob)
  })
}

export type LockCard = LockCopy & {
  artwork: LockArtwork[]
  paused: boolean
}

function session(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null
  return navigator.mediaSession
}

function holdPlayback(): void {
  const audio = (navigator as Navigator & { audioSession?: { type?: string } }).audioSession
  if (audio) audio.type = 'playback'
}

export function showLockCard(card: LockCard): void {
  const now = session()
  if (!now || typeof MediaMetadata === 'undefined') return
  holdPlayback()
  now.metadata = new MediaMetadata({
    title: card.title,
    artist: card.artist,
    album: card.album,
    artwork: card.artwork,
  })
  now.playbackState = card.paused ? 'paused' : 'playing'
}

export function showLockClock(position: number, duration: number, paused: boolean): void {
  const now = session()
  if (!now || duration <= 0) return
  now.playbackState = paused ? 'paused' : 'playing'
  try {
    now.setPositionState({
      duration,
      playbackRate: paused ? 0 : 1,
      position: Math.min(Math.max(0, position), duration),
    })
  } catch {
    // A clock that runs backwards is dropped. The card keeps the last good one.
  }
}

export function clearLockCard(): void {
  const now = session()
  if (!now) return
  now.metadata = null
  now.playbackState = 'none'
  try {
    now.setPositionState(undefined)
  } catch {
    // Some engines reject a cleared clock.
  }
}

export type LockActions = {
  play: () => void
  pause: () => void
  /** Positive seeks forward. */
  skip: (seconds: number) => void
  previous: () => void
  next: () => void
}

/** Same jumps as the in-book bar: five seconds, and one paragraph either way. */
export const LOCK_SKIP_SECONDS = 5

function setHandler(now: MediaSession, name: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    now.setActionHandler(name, handler)
  } catch {
    // This engine does not offer that button.
  }
}

export function bindLockActions(actions: LockActions): () => void {
  const now = session()
  if (!now) return () => {}
  setHandler(now, 'play', () => actions.play())
  setHandler(now, 'pause', () => actions.pause())
  setHandler(now, 'seekbackward', () => actions.skip(-LOCK_SKIP_SECONDS))
  setHandler(now, 'seekforward', () => actions.skip(LOCK_SKIP_SECONDS))
  setHandler(now, 'previoustrack', () => actions.previous())
  setHandler(now, 'nexttrack', () => actions.next())
  return () => {
    setHandler(now, 'play', null)
    setHandler(now, 'pause', null)
    setHandler(now, 'seekbackward', null)
    setHandler(now, 'seekforward', null)
    setHandler(now, 'previoustrack', null)
    setHandler(now, 'nexttrack', null)
  }
}
