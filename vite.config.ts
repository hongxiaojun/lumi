import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { leafAiDbPlugin } from './vite/leafAiDb.ts'
import { leafHubPlugin } from './vite/leafHub.ts'
import { pdfjsAssetsPlugin } from './vite/pdfjsAssets.ts'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), leafAiDbPlugin(), leafHubPlugin(), pdfjsAssetsPlugin(root)],
  resolve: {
    alias: {
      'foliate-js': path.join(root, 'vendor/foliate-js'),
    },
  },
  optimizeDeps: {
    exclude: ['foliate-js'],
    include: ['pdfjs-dist'],
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/__gtx': {
        target: 'https://translate.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__gtx/, ''),
      },
      '/__gpa': {
        target: 'https://translate-pa.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__gpa/, ''),
      },
      '/__edge-auth': {
        target: 'https://edge.microsoft.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__edge-auth/, ''),
      },
      '/__edge-api': {
        target: 'https://api-edge.cognitive.microsofttranslator.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__edge-api/, ''),
      },
    },
    headers: {
      'Cache-Control': 'no-store',
      // Block scripts inside EPUB content. See foliate-js README.
      'Content-Security-Policy':
        "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws: wss: http: https:; frame-src blob:;",
    },
  },
})
