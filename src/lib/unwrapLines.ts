/** Calibre heuristic unwrap, CJK-scaled. See calibre manual "Unwrap lines". */

export function looksHardWrapped(lengths: number[], profile: 'en' | 'zh'): boolean {
  const min = profile === 'zh' ? 4 : 20
  const usable = lengths.filter((n) => n >= min)
  if (usable.length < 8) return false
  const width = profile === 'zh' ? 10 : 100
  const counts = new Array<number>(20).fill(0)
  for (const n of usable) {
    const bucket = Math.min(19, Math.floor(n / width))
    counts[bucket] += 1
  }
  const peak = Math.max(...counts) / usable.length
  const sorted = [...usable].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  if (peak >= 0.4) {
    if (profile === 'zh' && median > 40) return false
    return true
  }
  if (profile !== 'zh') return false
  if (median === 0 || median > 40) return false
  const clustered = usable.filter((n) => n >= median * 0.5 && n <= median * 1.5).length
  return clustered / usable.length >= 0.5
}

export function typicalLineLength(lengths: number[], factor = 0.4): number {
  const unique = [...new Set(lengths.filter((n) => n > 0))].sort((a, b) => a - b)
  if (!unique.length) return 0
  const avg = unique.reduce((sum, n) => sum + n, 0) / unique.length
  const capped = unique.filter((n) => n <= avg * 2)
  if (!capped.length) return unique[0] ?? 0
  const t = Math.min(1, Math.max(0, factor))
  const index = Math.max(0, Math.min(capped.length - 1, Math.floor(capped.length * t) - 1))
  return capped[index] ?? 0
}

export function shouldAttemptUnwrap(_lengths: number[], _profile: 'en' | 'zh'): boolean {
  return true
}
