import { describe, expect, it } from 'vitest'
import { normalizePdfText } from './normalize'

describe('normalizePdfText', () => {
  it('maps Kangxi radicals via NFKC', () => {
    expect(normalizePdfText('核⼼')).toBe('核心')
    expect(normalizePdfText('⽤约束')).toBe('用约束')
    expect(normalizePdfText('⾄少')).toBe('至少')
  })

  it('maps CJK radical supplement forms used by macOS PingFang PDFs', () => {
    expect(normalizePdfText('⻓期')).toBe('长期')
    expect(normalizePdfText('第2⻚')).toBe('第2页')
    expect(normalizePdfText('⻆度')).toBe('角度')
    expect(normalizePdfText('⻄方')).toBe('西方')
    expect(normalizePdfText('⻣头')).toBe('骨头')
    expect(normalizePdfText('⺠宿')).toBe('民宿')
  })

  it('leaves ordinary Latin and Han alone', () => {
    expect(normalizePdfText('Hello 世界')).toBe('Hello 世界')
  })
})
