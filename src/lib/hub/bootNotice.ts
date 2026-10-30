export type PageLocation = {
  protocol: string
  hostname: string
  port: string
}

export function packagedApp(location: PageLocation, tauri: boolean): boolean {
  if (!tauri || location.port === '5173') return false
  return true
}

export function missingHubNotice(packaged: boolean, failure?: string): string | null {
  if (failure) return `书库没有读出来：${failure}`
  if (packaged) return null
  return '书库没有读出来。'
}
