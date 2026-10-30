import { describe, expect, it } from 'vitest'
import { missingHubNotice, packagedApp } from './bootNotice'

describe('packaged app shelf notice', () => {
  it('stays quiet when the installed app has no dev hub', () => {
    const packaged = packagedApp({ protocol: 'tauri:', hostname: 'localhost', port: '' }, true)
    expect(packaged).toBe(true)
    expect(missingHubNotice(packaged)).toBeNull()
  })

  it('treats the http tauri host as the installed app', () => {
    expect(packagedApp({ protocol: 'http:', hostname: 'tauri.localhost', port: '' }, true)).toBe(true)
  })

  it('still reports a missing hub while the dev server is the page', () => {
    const packaged = packagedApp({ protocol: 'http:', hostname: 'localhost', port: '5173' }, true)
    expect(packaged).toBe(false)
    const notice = missingHubNotice(packaged)
    expect(notice).toBe('书库没有读出来。')
    expect(notice).not.toContain('10.10.10.20')
    expect(notice).not.toContain('Safari')
  })

  it('reports a real boot failure without sending anyone to the old dev address', () => {
    const notice = missingHubNotice(true, '磁盘没有写完')
    expect(notice).toBe('书库没有读出来：磁盘没有写完')
    expect(notice).not.toContain('10.10.10.20')
  })
})
