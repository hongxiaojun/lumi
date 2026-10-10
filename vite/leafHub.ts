import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createHub, type Hub } from './hubStore.ts'

const FILE_LIMIT = 200_000_000

export function defaultHubRoot(): string {
  return process.env.LEAF_HUB_DIR || path.join(os.homedir(), '.leaf-reader', 'hub')
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readJson(req: IncomingMessage, limit = 2_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function pipeFile(req: IncomingMessage, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const out = fs.createWriteStream(dest)
    let size = 0
    let failed = false
    const fail = (error: Error) => {
      if (failed) return
      failed = true
      out.destroy()
      fs.rmSync(dest, { force: true })
      reject(error)
    }
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > FILE_LIMIT) {
        fail(new Error('文件太大'))
        req.destroy()
        return
      }
      if (!out.write(chunk)) req.pause()
    })
    out.on('drain', () => req.resume())
    req.on('end', () => {
      if (!failed) out.end()
    })
    req.on('error', fail)
    out.on('error', fail)
    out.on('finish', () => {
      if (!failed) resolve()
    })
  })
}

function imageType(file: string): string {
  const head = Buffer.alloc(12)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, head, 0, 12, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg'
  if (head[0] === 0x89 && head[1] === 0x50) return 'image/png'
  if (head[0] === 0x47 && head[1] === 0x49) return 'image/gif'
  return 'application/octet-stream'
}

function userId(req: IncomingMessage): string {
  const raw = req.headers['x-leaf-user']
  const id = Array.isArray(raw) ? raw[0] : raw
  if (!id) throw new Error('缺少设备账号')
  return id
}

async function handle(hub: Hub, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://leaf.local')
  const parts = url.pathname.replace(/^\/__leaf-hub/, '').split('/').filter(Boolean)
  const method = req.method ?? 'GET'

  if (method === 'GET' && parts[0] === 'health') {
    json(res, 200, { ok: true })
    return
  }
  if (method === 'POST' && parts[0] === 'session') {
    const body = (await readJson(req)) as { id?: string; name?: string }
    json(res, 200, hub.session(String(body.id ?? ''), String(body.name ?? '')))
    return
  }
  if (method === 'GET' && parts[0] === 'books' && parts.length === 1) {
    json(res, 200, hub.listShelf(userId(req)))
    return
  }
  if (method === 'POST' && parts[0] === 'books' && parts.length === 1) {
    const body = (await readJson(req)) as {
      id: string
      title: string
      author: string
      fileName: string
      addedAt: number
      language?: string
      aiSlug?: string
      aiBuiltAt?: number
    }
    json(res, 200, hub.saveMeta(body))
    return
  }
  if (parts[0] === 'books' && parts.length === 3 && parts[2] === 'file') {
    const id = parts[1]
    if (method === 'PUT') {
      if (!hub.metaOf(id)) throw new Error('找不到这本书')
      await pipeFile(req, hub.filePath(id))
      json(res, 200, { ok: true })
      return
    }
    if (method === 'GET') {
      const file = hub.filePath(id)
      if (!fs.existsSync(file)) {
        json(res, 404, { error: '找不到这本书' })
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/octet-stream')
      fs.createReadStream(file).pipe(res)
      return
    }
  }
  if (parts[0] === 'books' && parts.length === 3 && parts[2] === 'cover') {
    const id = parts[1]
    if (method === 'PUT') {
      if (!hub.metaOf(id)) throw new Error('找不到这本书')
      await pipeFile(req, hub.coverPath(id))
      hub.markCover(id, true)
      json(res, 200, { ok: true })
      return
    }
    if (method === 'GET') {
      const file = hub.coverPath(id)
      if (!fs.existsSync(file)) {
        json(res, 404, { error: '没有封面' })
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', imageType(file))
      fs.createReadStream(file).pipe(res)
      return
    }
  }
  if (method === 'DELETE' && parts[0] === 'books' && parts.length === 2) {
    hub.removeBook(parts[1])
    json(res, 200, { ok: true })
    return
  }
  const user = userId(req)
  if (method === 'GET' && parts[0] === 'prefs') {
    json(res, 200, hub.prefs(user))
    return
  }
  if (method === 'PUT' && parts[0] === 'prefs') {
    hub.savePrefs(user, await readJson(req))
    json(res, 200, { ok: true })
    return
  }
  if (method === 'GET' && parts[0] === 'book-look') {
    json(res, 200, hub.bookLook(user, url.searchParams.get('bookId') ?? ''))
    return
  }
  if (method === 'PUT' && parts[0] === 'book-look') {
    const body = (await readJson(req)) as { bookId?: string; look?: unknown }
    hub.saveBookLook(user, String(body.bookId ?? ''), body.look ?? null)
    json(res, 200, { ok: true })
    return
  }
  if (method === 'GET' && parts[0] === 'translator') {
    json(res, 200, hub.translator(user))
    return
  }
  if (method === 'PUT' && parts[0] === 'translator') {
    hub.saveTranslator(user, await readJson(req))
    json(res, 200, { ok: true })
    return
  }
  if (method === 'PUT' && parts[0] === 'progress') {
    const body = (await readJson(req)) as {
      bookId: string
      cfi: string | null
      fraction: number
      lastOpenedAt: number | null
      parallel?: boolean
    }
    hub.saveProgress(user, body.bookId, body)
    json(res, 200, { ok: true })
    return
  }
  if (method === 'GET' && parts[0] === 'notes') {
    const bookId = url.searchParams.get('bookId')
    const rows = hub.notes(user).filter((row) => !bookId || row.bookId === bookId)
    json(res, 200, rows)
    return
  }
  if (method === 'PUT' && parts[0] === 'notes') {
    hub.putNote(user, (await readJson(req)) as { id: string; bookId: string })
    json(res, 200, { ok: true })
    return
  }
  if (method === 'DELETE' && parts[0] === 'notes' && parts[1]) {
    hub.deleteNote(user, decodeURIComponent(parts[1]))
    json(res, 200, { ok: true })
    return
  }
  if (method === 'GET' && parts[0] === 'bookmarks') {
    const bookId = url.searchParams.get('bookId')
    const rows = hub.bookmarks(user).filter((row) => !bookId || row.bookId === bookId)
    json(res, 200, rows)
    return
  }
  if (method === 'PUT' && parts[0] === 'bookmarks') {
    hub.putBookmark(user, (await readJson(req)) as { id: string; bookId: string })
    json(res, 200, { ok: true })
    return
  }
  if (method === 'DELETE' && parts[0] === 'bookmarks' && parts[1]) {
    hub.deleteBookmark(user, decodeURIComponent(parts[1]))
    json(res, 200, { ok: true })
    return
  }
  json(res, 404, { error: 'not found' })
}

export function leafHubPlugin(root = defaultHubRoot()): Plugin {
  const hub = createHub(root)
  let tail: Promise<void> = Promise.resolve()
  const gate = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
  return {
    name: 'leaf-hub',
    configureServer(server) {
      server.middlewares.use('/__leaf-hub', (req, res) => {
        const line = `${new Date().toISOString()} ${req.socket.remoteAddress ?? '-'} ${req.method} ${req.url} ${req.headers['user-agent'] ?? ''}\n`
        fs.appendFile(path.join(root, 'access.log'), line, () => {})
        void gate(() => handle(hub, req, res)).catch((error: unknown) => {
          if (res.writableEnded) return
          const message = error instanceof Error ? error.message : 'write failed'
          json(res, 400, { error: message })
        })
      })
    },
  }
}
