import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ResolvedConfig } from 'vite'

export function pdfjsAssetsPlugin(root: string): Plugin {
  const cmaps = path.join(root, 'node_modules/pdfjs-dist/cmaps')
  const fonts = path.join(root, 'node_modules/pdfjs-dist/standard_fonts')
  let outDir = path.join(root, 'dist')
  return {
    name: 'pdfjs-assets',
    configResolved(config: ResolvedConfig) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!serve(req, res, '/pdfjs/cmaps/', cmaps) && !serve(req, res, '/pdfjs/standard_fonts/', fonts)) next()
      })
    },
    closeBundle() {
      fs.cpSync(cmaps, path.join(outDir, 'pdfjs/cmaps'), { recursive: true })
      fs.cpSync(fonts, path.join(outDir, 'pdfjs/standard_fonts'), { recursive: true })
    },
  }
}

function serve(req: IncomingMessage, res: ServerResponse, prefix: string, dir: string): boolean {
  const url = req.url?.split('?')[0] ?? ''
  if (!url.startsWith(prefix)) return false
  const rel = decodeURIComponent(url.slice(prefix.length))
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
    res.statusCode = 400
    res.end()
    return true
  }
  const file = path.resolve(dir, rel)
  const base = path.resolve(dir)
  if (file !== base && !file.startsWith(base + path.sep)) {
    res.statusCode = 400
    res.end()
    return true
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404
    res.end()
    return true
  }
  res.setHeader('Content-Type', 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
  return true
}
