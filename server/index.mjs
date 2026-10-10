import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../dist')
const libraryRoot = process.env.LEAF_LIBRARY_DIR || path.join(here, '../data/library')
const port = Number(process.env.PORT || 8080)

function assertSafeRel(rel) {
  const normalized = String(rel).replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '..')) throw new Error('bad path')
  return parts.join('/')
}

function writeLibrary(files, removeSlug) {
  fs.mkdirSync(libraryRoot, { recursive: true })
  if (removeSlug) {
    fs.rmSync(path.join(libraryRoot, assertSafeRel(removeSlug)), { recursive: true, force: true })
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
  if (url.pathname === '/__leaf-ai-db' && req.method === 'GET') {
    send(res, 200, JSON.stringify({ dir: libraryRoot, ok: true }))
    return
  }
  if (url.pathname === '/__leaf-ai-db' && req.method === 'POST') {
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
server.listen(port, '0.0.0.0', () => {
  console.log(`叶读 listening on ${port}, library at ${libraryRoot}`)
})
