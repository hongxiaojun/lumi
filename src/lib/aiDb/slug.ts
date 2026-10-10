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
  const cut = cleaned.slice(0, 80)
  return cut.replace(/-$/, '') || 'untitled'
}

export function chapterFileName(index: number, title: string): string {
  const n = String(index + 1).padStart(2, '0')
  return `${n}-${bookSlug(title)}.md`
}
