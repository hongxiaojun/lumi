export type DeviceAccount = { id: string; name: string }

const KEY = 'leaf:device'

export function deviceLabel(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac'
  if (/Linux/i.test(ua)) return 'Linux'
  return '设备'
}

export function freshDevice(ua: string, id: string): DeviceAccount {
  return { id, name: `${deviceLabel(ua)}-${id.replace(/-/g, '').slice(0, 4)}` }
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function readDevice(storage: StorageLike, ua: string, newId: () => string): DeviceAccount {
  const raw = storage.getItem(KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DeviceAccount
      if (typeof parsed.id === 'string' && typeof parsed.name === 'string' && parsed.id && parsed.name) {
        return parsed
      }
    } catch {
      // fall through and create one
    }
  }
  const created = freshDevice(ua, newId())
  storage.setItem(KEY, JSON.stringify(created))
  return created
}

export function writeDevice(storage: StorageLike, device: DeviceAccount): void {
  storage.setItem(KEY, JSON.stringify(device))
}
