/** A new Blob. Putting the same Blob back into IndexedDB can drop the bytes on WebKit. */
async function cloneCover(cover: Blob | null | undefined): Promise<Blob | null> {
  if (!cover || cover.size === 0) return null
  try {
    const bytes = new Uint8Array(await cover.arrayBuffer())
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return new Blob([copy], { type: cover.type || 'image/jpeg' })
  } catch (error) {
    console.error('cover', error)
    return null
  }
}

/** Keep the stored cover when this write has none or an empty blob. */
export async function coverToStore(
  incoming: Blob | null | undefined,
  stored: Blob | null | undefined,
): Promise<Blob | null> {
  return (await cloneCover(incoming)) ?? (await cloneCover(stored))
}
