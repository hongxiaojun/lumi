import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 读项目根下的配置文件，守住「打包后不放行明文 http」这条安全约定（R3）。 */
function readRoot(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

describe('R3 网络访问收窄', () => {
  it('CSP connect-src 不再包含通用 http: 通配', () => {
    const conf = JSON.parse(readRoot('src-tauri/tauri.conf.json')) as {
      app: { security: { csp: string } }
    }
    const connect = /connect-src ([^;]+)/.exec(conf.app.security.csp)?.[1] ?? ''
    const tokens = connect.split(/\s+/).filter(Boolean)
    expect(tokens).not.toContain('http:')
    expect(tokens).toContain('https:')
    // Tauri 与 leafbook 协议的 localhost 特例仍在，不能误删。
    expect(tokens).toContain('http://ipc.localhost')
    expect(tokens).toContain('http://leafbook.localhost')
  })

  it('capabilities http:default 不再允许 http://*:*', () => {
    const cap = JSON.parse(readRoot('src-tauri/capabilities/default.json')) as {
      permissions: Array<{ identifier: string; allow?: { url: string }[] }>
    }
    const http = cap.permissions.find((p) => p.identifier === 'http:default')
    expect(http?.allow).toContainEqual({ url: 'https://*:*' })
    expect(http?.allow).not.toContainEqual({ url: 'http://*:*' })
  })
})
