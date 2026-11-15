// @vitest-environment node
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * 独立 server 的写库门：设了 LEAF_TOKEN 就只有带密钥的请求能写，没设时只有本机。
 * 浏览器加不了请求头，所以还要认「先用 ?token= 换来的 cookie」。
 */

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string }

const running: ChildProcess[] = []

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

function request(port: number, options: { method: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: options.method, path: options.path, headers: options.headers },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        )
      },
    )
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function startServer(env: Record<string, string>): Promise<{ port: number; library: string }> {
  const port = await freePort()
  const library = mkdtempSync(path.join(os.tmpdir(), 'lumi-auth-'))
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), LEAF_LIBRARY_DIR: library, LEAF_BIND_HOST: '127.0.0.1', ...env },
    stdio: 'ignore',
  })
  running.push(child)
  for (let i = 0; i < 100; i += 1) {
    try {
      const probe = await request(port, { method: 'GET', path: '/health' })
      if (probe.status === 200) return { port, library }
    } catch {
      // 还没起来
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('server did not start')
}

const jsonHeaders = { 'Content-Type': 'application/json' }

afterEach(() => {
  while (running.length) running.pop()?.kill()
})

describe('server 写库门', () => {
  it('没设密钥时，本机可以写', async () => {
    const { port, library } = await startServer({ LEAF_TOKEN: '' })
    const reply = await request(port, {
      method: 'POST',
      path: '/__leaf-ai-db',
      headers: jsonHeaders,
      body: JSON.stringify({ files: { 'local-book/AI.md': 'hello' } }),
    })
    expect(reply.status).toBe(200)
    expect(readFileSync(path.join(library, 'local-book/AI.md'), 'utf8')).toBe('hello')
  })

  it('设了密钥时，无凭证一律 401，带请求头才写', async () => {
    const { port, library } = await startServer({ LEAF_TOKEN: 'secret-token' })
    const body = JSON.stringify({ files: { 'book/AI.md': 'hello' } })

    const denied = await request(port, { method: 'POST', path: '/__leaf-ai-db', headers: jsonHeaders, body })
    expect(denied.status).toBe(401)
    expect(existsSync(path.join(library, 'book/AI.md'))).toBe(false)

    const wrong = await request(port, {
      method: 'POST',
      path: '/__leaf-ai-db',
      headers: { ...jsonHeaders, 'X-Leaf-Token': 'nope' },
      body,
    })
    expect(wrong.status).toBe(401)

    const allowed = await request(port, {
      method: 'POST',
      path: '/__leaf-ai-db',
      headers: { ...jsonHeaders, 'X-Leaf-Token': 'secret-token' },
      body,
    })
    expect(allowed.status).toBe(200)
    expect(readFileSync(path.join(library, 'book/AI.md'), 'utf8')).toBe('hello')
  })

  it('浏览器用 ?token= 换到 cookie，之后不带请求头也能写', async () => {
    const { port, library } = await startServer({ LEAF_TOKEN: 'secret-token' })

    const handoff = await request(port, { method: 'GET', path: '/?token=secret-token' })
    expect(handoff.status).toBe(302)
    expect(handoff.headers.location).toBe('/')
    const cookie = String(handoff.headers['set-cookie'] ?? '')
    expect(cookie).toContain('leaf_token=secret-token')
    expect(cookie).toContain('HttpOnly')

    const reply = await request(port, {
      method: 'POST',
      path: '/__leaf-ai-db',
      headers: { ...jsonHeaders, Cookie: 'leaf_token=secret-token' },
      body: JSON.stringify({ files: { 'cookie-book/AI.md': 'via cookie' } }),
    })
    expect(reply.status).toBe(200)
    expect(readFileSync(path.join(library, 'cookie-book/AI.md'), 'utf8')).toBe('via cookie')
  })

  it('错的 ?token= 不换 cookie，地址也不跳', async () => {
    const { port } = await startServer({ LEAF_TOKEN: 'secret-token' })
    const reply = await request(port, { method: 'GET', path: '/?token=nope' })
    expect(reply.status).toBe(200)
    expect(reply.headers['set-cookie']).toBeUndefined()
  })

  it('删书拒绝删到库根', async () => {
    const { port, library } = await startServer({ LEAF_TOKEN: 'secret-token' })
    const reply = await request(port, {
      method: 'POST',
      path: '/__leaf-ai-db',
      headers: { ...jsonHeaders, 'X-Leaf-Token': 'secret-token' },
      body: JSON.stringify({ files: {}, removeSlug: '.' }),
    })
    expect(reply.status).toBe(400)
    expect(existsSync(library)).toBe(true)
  })
})
