import { describe, expect, it } from 'vitest'
import {
  READ_FOCUS_DIM,
  READ_FOCUS_HERE,
  paintReadFocus,
  readFocusCSS,
  readFocusDim,
  readFocusHere,
} from './readFocus'

function page(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body
}

function sourcesOf(root: ParentNode): Element[] {
  return [...root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote')].filter(
    (el) => !el.closest('[data-leaf-tr], .leaf-tr') && !el.parentElement?.closest('h1, h2, h3, h4, p, li, blockquote'),
  )
}

function dimmed(el: Element): boolean {
  return el.classList.contains(READ_FOCUS_DIM) || el.closest(`.${READ_FOCUS_DIM}`) != null
}

describe('readFocusDim', () => {
  it('blurs the other paragraphs, and uses opacity only when motion should stay still', () => {
    expect(readFocusDim(false)).toEqual({ filter: 'blur(2px)', opacity: 0.5 })
    expect(readFocusDim(true)).toEqual({ filter: 'none', opacity: 0.4 })
    const css = readFocusCSS()
    const at = css.indexOf('prefers-reduced-motion')
    expect(at).toBeGreaterThan(-1)
    expect(css.slice(0, at)).toContain('blur(2px)')
    expect(css.slice(at)).toContain('filter: none')
    expect(css.slice(at)).not.toMatch(/blur\(/)
    expect(css).not.toContain('#2F8FE8')
    expect(css).not.toContain('#14C8C4')
    expect(readFocusHere()).not.toContain('#2F8FE8')
    expect(readFocusHere()).not.toContain('#14C8C4')
  })
})

describe('paintReadFocus', () => {
  it('does nothing until a spoken paragraph is known', () => {
    const body = page('<p>前面一段</p><p>当前这一句</p><p>后面一段</p>')
    const sources = sourcesOf(body)
    expect(() => paintReadFocus([], null)).not.toThrow()
    paintReadFocus(sources, null)
    paintReadFocus(sources, -1)
    paintReadFocus(sources, 9)
    expect(body.querySelector(`.${READ_FOCUS_DIM}, .${READ_FOCUS_HERE}`)).toBeNull()
  })

  it('recedes every other paragraph and keeps the spoken one, including its translation', () => {
    const body = page(`
      <p>前面一段</p>
      <img alt="">
      <p>当前这一句<span data-leaf-tr="1">当前译文</span></p>
      <p data-leaf-tr="1">当前段后的对照</p>
      <p>后面一段<span class="leaf-tr">后面译文</span></p>
      <p data-leaf-tr="1">后面段后的对照</p>
    `)
    const sources = sourcesOf(body)
    expect(sources.map((el) => el.textContent)).toEqual([
      '前面一段',
      '当前这一句当前译文',
      '后面一段后面译文',
    ])
    paintReadFocus(sources, 1)
    expect(sources[0].classList.contains(READ_FOCUS_DIM)).toBe(true)
    expect(sources[1].classList.contains(READ_FOCUS_HERE)).toBe(true)
    expect(sources[1].classList.contains(READ_FOCUS_DIM)).toBe(false)
    expect(sources[2].classList.contains(READ_FOCUS_DIM)).toBe(true)
    const hereTr = sources[1].querySelector('[data-leaf-tr]')!
    const afterTr = body.querySelector('p[data-leaf-tr]')!
    expect(dimmed(hereTr)).toBe(false)
    expect(hereTr.classList.contains(READ_FOCUS_HERE)).toBe(false)
    expect(dimmed(afterTr)).toBe(false)
    expect(dimmed(sources[2].querySelector('.leaf-tr')!)).toBe(true)
    expect(dimmed(body.querySelectorAll('p[data-leaf-tr]')[1]!)).toBe(true)
    expect(body.querySelector('img')!.classList.contains(READ_FOCUS_DIM)).toBe(false)
    expect(sources[1].closest(`.${READ_FOCUS_DIM}`)).toBeNull()
  })

  it('does not treat the next paragraph’s translation as part of this one when a wrapper sits between them', () => {
    const body = page('<p>当前段</p><div><p>后段</p><span data-leaf-tr="1">后译</span></div>')
    const sources = sourcesOf(body)
    paintReadFocus(sources, 0)
    expect(sources[0].classList.contains(READ_FOCUS_HERE)).toBe(true)
    expect(sources[1].classList.contains(READ_FOCUS_DIM)).toBe(true)
    expect(dimmed(body.querySelector('span')!)).toBe(true)
    expect(sources[1].classList.contains(READ_FOCUS_DIM)).toBe(true)
    expect(body.querySelector('div')!.classList.contains(READ_FOCUS_DIM)).toBe(false)
  })

  it('moves the sharp paragraph with the voice and restores the page when speech stops', () => {
    const body = page('<h2>标题</h2><p>甲段</p><p>乙段</p>')
    const sources = sourcesOf(body)
    paintReadFocus(sources, 0)
    expect(sources[0].classList.contains(READ_FOCUS_HERE)).toBe(true)
    expect(sources[1].classList.contains(READ_FOCUS_DIM)).toBe(true)
    paintReadFocus(sources, 2)
    expect(sources[0].classList.contains(READ_FOCUS_HERE)).toBe(false)
    expect(sources[0].classList.contains(READ_FOCUS_DIM)).toBe(true)
    expect(sources[2].classList.contains(READ_FOCUS_HERE)).toBe(true)
    expect(sources[2].classList.contains(READ_FOCUS_DIM)).toBe(false)
    paintReadFocus(sources, null)
    expect(body.querySelector(`.${READ_FOCUS_DIM}, .${READ_FOCUS_HERE}`)).toBeNull()
  })
})
