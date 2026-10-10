import { renderAiBook, renderCatalog } from './render'
import type { AiBook, CatalogEntry } from './types'

export async function persistAiBook(book: AiBook, catalog: CatalogEntry[]): Promise<void> {
  const files = { ...renderAiBook(book), ...renderCatalog(catalog) }
  await writeLibraryFiles(files)
}

export async function persistCatalog(catalog: CatalogEntry[]): Promise<void> {
  await writeLibraryFiles(renderCatalog(catalog))
}

export async function removeAiBook(slug: string, catalog: CatalogEntry[]): Promise<void> {
  await writeLibraryFiles(renderCatalog(catalog), slug)
}

async function writeLibraryFiles(files: Record<string, string>, removeSlug?: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('save_ai_library', { files, removeSlug: removeSlug ?? null })
    return
  }
  const res = await fetch('/__leaf-ai-db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, removeSlug: removeSlug ?? null }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || 'AI 书库写入失败')
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
