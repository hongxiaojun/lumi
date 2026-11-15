import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../dist')
const libraryRoot = process.env.LEAF_LIBRARY_DIR || path.join(here, '../data/library')
const port = Number(process.env.PORT || 8080)
// 默认只对本机开放。要对局域网 / NAS 开放，必须显式设 LEAF_BIND_HOST=0.0.0.0 并配 LEAF_TOKEN。
const bindHost = process.env.LEAF_BIND_HOST || '127.0.0.1'
const token = process.env.LEAF_TOKEN || ''
const loopbackHosts = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

function isLoopback(req) {
  return loopbackHosts.has(req.socket.remoteAddress)
}

const TOKEN_COOKIE = 'leaf_token'

function cookieValue(req, name) {
  const raw = req.headers.cookie
  if (typeof raw !== 'string' || !raw) return ''
  for (const part of raw.split(';')) {
    const at = part.indexOf('=')
    if (at < 0) continue
    if (part.slice(0, at).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(at + 1).trim())
    } catch {
      return ''
    }
  }
  return ''
}

/** Accepts `X-Leaf-Token: <token>`, `Authorization: Bearer <token>`, or the
 * cookie the page is given when it is first opened with `?token=<token>`. */
function requestToken(req) {
  const direct = req.headers['x-leaf-token']
  if (typeof direct === 'string' && direct) return direct
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return cookieValue(req, TOKEN_COOKIE)
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

/** Write endpoints are guarded: with a token, only a matching request writes;
 * without one, only the local machine writes. */
function writeAuthorized(req) {
  if (token) return timingSafeEqual(requestToken(req), token)
  return isLoopback(req)
}

// 与 src/lib/aiDb/safePath.ts 保持同一套规则：独立 server 无构建步骤、无法 import TS，
// 改这条规则时必须两处同步，否则两个后端行为会漂移。
function assertSafeRel(rel) {
  const normalized = String(rel).replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error('bad path')
  }
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('bad path')
  }
  return parts.join('/')
}

function writeLibrary(files, removeSlug) {
  fs.mkdirSync(libraryRoot, { recursive: true })
  if (removeSlug) {
    const dir = path.resolve(path.join(libraryRoot, assertSafeRel(removeSlug)))
    if (dir === path.resolve(libraryRoot)) throw new Error('refusing to remove library root')
    fs.rmSync(dir, { recursive: true, force: true })
  }
  for (const [rel, content] of Object.entries(files ?? {})) {
    const dest = path.join(libraryRoot, assertSafeRel(rel))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, content, 'utf8')
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body)
}

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  if (file.endsWith('.json')) return 'application/json; charset=utf-8'
  if (file.endsWith('.svg')) return 'image/svg+xml'
  if (file.endsWith('.woff2')) return 'font/woff2'
  if (file.endsWith('.epub')) return 'application/epub+zip'
  return 'application/octet-stream'
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 40_000_000) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  // 浏览器没法自己加请求头，所以页面第一次用 `?token=…` 打开时把密钥记进 HttpOnly cookie，
  // 再把 token 从地址栏抹掉，免得留在历史和 Referer 里。
  const supplied = url.searchParams.get('token')
  if (token && supplied && (req.method === 'GET' || req.method === 'HEAD')) {
    if (timingSafeEqual(supplied, token)) {
      url.searchParams.delete('token')
      const rest = url.searchParams.toString()
      res.writeHead(302, {
        'Set-Cookie': `${TOKEN_COOKIE}=${encodeURIComponent(supplied)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`,
        Location: `${url.pathname}${rest ? `?${rest}` : ''}`,
      })
      res.end()
      return
    }
  }
  if (url.pathname === '/__leaf-ai-db' && req.method === 'GET') {
    send(res, 200, JSON.stringify({ dir: libraryRoot, ok: true }))
    return
  }
  if (url.pathname === '/__leaf-ai-db' && req.method === 'POST') {
    if (!writeAuthorized(req)) {
      send(res, 401, JSON.stringify({ error: 'unauthorized' }))
      return
    }
    void readBody(req)
      .then((raw) => {
        const body = JSON.parse(raw)
        writeLibrary(body.files, body.removeSlug)
        send(res, 200, JSON.stringify({ ok: true, dir: libraryRoot }))
      })
      .catch((err) => send(res, 400, JSON.stringify({ error: String(err.message || err) })))
    return
  }
  if (url.pathname === '/health') {
    send(res, 200, JSON.stringify({ ok: true }))
    return
  }

  const rel = url.pathname === '/' ? '/index.html' : url.pathname
  const file = path.join(dist, path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ''))
  if (!file.startsWith(dist)) {
    send(res, 403, 'forbidden', 'text/plain')
    return
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(dist, 'index.html'), (fallbackErr, html) => {
        if (fallbackErr) send(res, 404, 'not found', 'text/plain')
        else send(res, 200, html, 'text/html; charset=utf-8')
      })
      return
    }
    send(res, 200, data, mime(file))
  })
})

fs.mkdirSync(libraryRoot, { recursive: true })
if (!loopbackHosts.has(bindHost) && !token) {
  console.warn(
    `[leaf] 服务监听在 ${bindHost}，但没有设置 LEAF_TOKEN：非本机的写库/删书请求都会被拒绝（401）。` +
      '要对局域网开放，请设置 LEAF_TOKEN。',
  )
}
server.listen(port, bindHost, () => {
  console.log(`叶读 listening on ${bindHost}:${port}, library at ${libraryRoot}`)
})
