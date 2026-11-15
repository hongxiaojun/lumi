export function assertSafeRel(rel: string): string {
  const normalized = rel.replace(/\\/g, '/')
  // 拒绝空串、绝对路径（POSIX 或 Windows 盘符），以及任何 `.` / `..` 分量。
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error('bad path')
  }
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('bad path')
  }
  return parts.join('/')
}
