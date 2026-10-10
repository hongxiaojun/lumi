import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

function assertSafeRel(rel: string): string {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '..')) throw new Error('bad path')
  return parts.join('/')
}

export function defaultLibraryRoot(): string {
  return process.env.LEAF_LIBRARY_DIR || path.join(os.homedir(), '.leaf-reader', 'library')
}

export function leafAiDbPlugin(root = defaultLibraryRoot()): Plugin {
  return {
    name: 'leaf-ai-db',
    configureServer(server) {
      server.middlewares.use('/__leaf-ai-db', (req, res, next) => {
        if (req.method === 'GET') {
          json(res, 200, { dir: root })
          return
        }
        if (req.method !== 'POST') {
          next()
          return
        }
        void readBody(req)
          .then((raw) => {
            const body = JSON.parse(raw) as {
              files?: Record<string, string>
              removeSlug?: string | null
            }
            writeLibrary(root, body.files ?? {}, body.removeSlug)
            json(res, 200, { ok: true, dir: root })
          })
          .catch((err: unknown) => {
            json(res, 400, { error: err instanceof Error ? err.message : 'write failed' })
          })
      })
    },
  }
}

export function writeLibrary(
  root: string,
  files: Record<string, string>,
  removeSlug?: string | null,
): void {
  fs.mkdirSync(root, { recursive: true })
  if (removeSlug) {
    const dir = path.join(root, assertSafeRel(removeSlug))
    fs.rmSync(dir, { recursive: true, force: true })
  }
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, assertSafeRel(rel))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, content, 'utf8')
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
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
