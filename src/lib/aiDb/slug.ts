export function bookSlug(title: string): string {
  const cleaned = title
    .normalize('NFKC')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  if (!cleaned) return 'untitled'
  const cut = cleaned.slice(0, 80).replace(/-$/, '')
  // `.` / `..` / 纯点号会经 join(root, slug) 落到书库根或根之外，回退为稳定安全名。
  if (!cut || /^\.+$/.test(cut)) return 'untitled'
  return cut
}

export function chapterFileName(index: number, title: string): string {
  const n = String(index + 1).padStart(2, '0')
  return `${n}-${bookSlug(title)}.md`
}
