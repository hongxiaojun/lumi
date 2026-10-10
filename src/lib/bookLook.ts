import type { Prefs } from '../types'

/** What a device remembers for one book. Translation stays on the book progress, not here. */
export type BookLook = Pick<Prefs, 'theme' | 'font' | 'fontSize' | 'lineHeight' | 'flow' | 'justify'>

export function lookOf(prefs: Prefs): BookLook {
  return {
    theme: prefs.theme,
    font: prefs.font,
    fontSize: prefs.fontSize,
    lineHeight: prefs.lineHeight,
    flow: prefs.flow,
    justify: prefs.justify,
  }
}

/** Device template fills any book that has no saved look. A saved look replaces only the visual fields. */
export function prefsWithLook(template: Prefs, look: BookLook | null | undefined): Prefs {
  if (!look) return template
  return { ...template, ...look, parallel: template.parallel }
}
