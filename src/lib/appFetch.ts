/** Tauri's HTTP plugin bypasses the webview's CORS and carries the app's proxy rules. */
export async function appFetch(): Promise<typeof fetch> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const mod = await import('@tauri-apps/plugin-http')
      return mod.fetch as unknown as typeof fetch
    }
  } catch {
    // fall through to browser fetch
  }
  return fetch
}
