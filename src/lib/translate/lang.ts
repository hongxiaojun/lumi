export type ScriptKind = 'zh' | 'en' | 'mixed' | 'other'
export type DirectionPref = 'auto' | 'en-zh' | 'zh-en'
export type LangPair = { from: string; to: string }

export function detectScript(text: string): ScriptKind {
  const sample = text.normalize('NFKC')
  const han = (sample.match(/\p{Script=Han}/gu) ?? []).length
  const latin = (sample.match(/[A-Za-z]/g) ?? []).length
  if (han === 0 && latin === 0) return 'other'
  if (han === 0) return 'en'
  if (latin === 0) return 'zh'
  const ratio = han / (han + latin)
  if (ratio >= 0.65) return 'zh'
  if (ratio <= 0.35) return 'en'
  return 'mixed'
}

export function resolveDirection(text: string, pref: DirectionPref): LangPair {
  if (pref === 'en-zh') return { from: 'en', to: 'zh-CN' }
  if (pref === 'zh-en') return { from: 'zh-CN', to: 'en' }
  const kind = detectScript(text)
  if (kind === 'zh') return { from: 'zh-CN', to: 'en' }
  return { from: 'en', to: 'zh-CN' }
}

export function shouldOpenParallel(
  language?: ScriptKind | null,
  englishDefault = true,
): boolean {
  if (language !== 'en') return false
  return englishDefault
}

export function resolveParallel(
  book: { language?: ScriptKind; parallel?: boolean },
  englishDefault = true,
): boolean {
  if (typeof book.parallel === 'boolean') return book.parallel
  return shouldOpenParallel(book.language, englishDefault)
}

export function microsoftLang(code: string): string {
  if (code === 'zh-CN' || code === 'zh') return 'zh-Hans'
  return code
}
