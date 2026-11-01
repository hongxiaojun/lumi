/** Bad-text-layer detector for PDF reflow (M13).
 *
 * Some PDFs (Acrobat-processed magazines, subset CID fonts) ship text whose
 * "codes" are glyph numbers with no ToUnicode map. Extractors then emit wrong
 * Han glyphs, private-use chars, and shifted Latin. No mapping-based engine can
 * recover those, so the page must go to OCR instead of into the EPUB.
 */

/** A suspicious char is one body text almost never contains: private use,
 * CJK Ext-A/compat/Ext-B+, C1 and other controls, the replacement char, and
 * the dingbat/arrows/enclosed blocks the wrong mappings keep landing in. */
function suspicious(code: number): boolean {
  if (code >= 0xe000 && code <= 0xf8ff) return true
  if (code >= 0x3400 && code <= 0x4dbf) return true
  if (code >= 0xf900 && code <= 0xfaff) return true
  if (code >= 0x20000) return true
  if (code >= 0x80 && code <= 0x9f) return true
  if (code < 0x20) return true
  if (code === 0xfffd) return true
  if (code >= 0x2190 && code <= 0x2bff) return true
  if (code >= 0x2460 && code <= 0x24ff) return true
  return false
}

/** Share of suspicious chars among non-whitespace chars. */
export function garbledRatio(sample: string): number {
  let total = 0
  let bad = 0
  for (const ch of sample) {
    if (/\s/u.test(ch)) continue
    total += 1
    if (suspicious(ch.codePointAt(0) ?? 0)) bad += 1
  }
  return total === 0 ? 0 : bad / total
}

/** Calibrated on real books: clean Chinese measures ≈0.0003, Acrobat-magazine
 * garbage ≈0.37, so 0.1 leaves room on both sides. */
const GARBLE_THRESHOLD = 0.1

/** Short samples cannot distinguish a bad font from a title page, so they stay clean. */
const MIN_SAMPLE = 24

export function looksGarbled(sample: string): boolean {
  let total = 0
  for (const ch of sample) {
    if (!/\s/u.test(ch)) total += 1
    if (total >= MIN_SAMPLE) break
  }
  if (total < MIN_SAMPLE) return false
  return garbledRatio(sample) >= GARBLE_THRESHOLD
}
