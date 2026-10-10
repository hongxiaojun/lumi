export type PendingOpen = {
  token: string
  name: string
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

async function tauriInvoke(): Promise<Invoke> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke as Invoke
}

/** Read whitelist tokens into File objects (one-shot read_opened_file each). */
export async function loadOpenedFiles(
  items: PendingOpen[],
  invoke?: Invoke,
): Promise<{ files: File[]; errors: string[] }> {
  const call = invoke ?? (await tauriInvoke())
  const files: File[] = []
  const errors: string[] = []
  for (const item of items) {
    try {
      const data = await call<ArrayBuffer>('read_opened_file', { token: item.token })
      files.push(new File([data], item.name))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      // Already consumed / expired token (e.g. remount race): skip quietly.
      if (reason.includes('unknown open token')) continue
      errors.push(`${item.name}：${reason}`)
    }
  }
  return { files, errors }
}

/** Drain cold-start pending queue after the listener is attached. */
export async function takeAndLoadOpenedFiles(): Promise<{ files: File[]; errors: string[] }> {
  if (!isTauri()) return { files: [], errors: [] }
  const invoke = await tauriInvoke()
  const pending = await invoke<PendingOpen[]>('take_pending_opens')
  if (!pending?.length) return { files: [], errors: [] }
  return loadOpenedFiles(pending, invoke)
}

/** Live opens while the app is already running. */
export async function subscribeOpenedFiles(
  onBatch: (items: PendingOpen[]) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<PendingOpen[]>('open-files', (event) => {
    void onBatch(event.payload ?? [])
  })
}

/** Unsupported drop/open names from Rust filter (「不支持的格式：xxx」). */
export async function subscribeRejectedOpens(
  onRejected: (names: string[]) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<string[]>('open-files-rejected', (event) => {
    const names = (event.payload ?? []).filter(Boolean)
    if (names.length) void onRejected(names)
  })
}

export function formatUnsupportedTip(names: string[]): string {
  return `不支持的格式：${names.join('、')}`
}
