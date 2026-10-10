export function assertSafeRel(rel: string): string {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '..')) {
    throw new Error('bad path')
  }
  return parts.join('/')
}
