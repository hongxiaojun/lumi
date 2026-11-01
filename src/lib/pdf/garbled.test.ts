import { describe, expect, it } from 'vitest'
import { garbledRatio, looksGarbled } from './garbled'

// Real garbage extracted from 《环球科学》2023-01: Source Han CID fonts without ToUnicode,
// so every char is a wrong mapping (PUA, Ext-A, dingbats, shifted Latin, C1 controls).
const GARBLED_ZH =
  '餓⟣綘鳓\uf63b桬䚃日խFEJUPST!IVBORJVLFYVF\x0fDPN㼭ꥬ㹔ⰻ\ue67b鵯⚡㼭ꥬ㹔⠔鄄⺫醙㖈♧⚡⥂䫡䚍㢪邆⚥\ue67b➢罜䕎䧭♧⚡蔠㷋\uf63cꥥた\ue67b鵯⚡蔠㷋⠔ꥥ满蔠㷋㓭\ue677絈蝒涸瑟㡲\ue678涸鄬鍒罜ꅺ佞ⴀ勻կ歋姼♧勻'

const CLEAN_ZH =
  '环球科学杂志是《科学美国人》的中文版，创刊于2006年，致力于把世界一流的科学报道带给中文读者。时间反演对称性是物理学的一个基本特征，直到1964年以前，科学家观察到的所有物理现象都满足这种对称性。'

const CLEAN_EN =
  'The Scientific American magazine was founded in 1845 and remains one of the most popular popular-science magazines in the world. Time-reversal symmetry is a basic feature of the laws of physics.'

describe('garbledRatio', () => {
  it('scores the real garbled sample high', () => {
    expect(garbledRatio(GARBLED_ZH)).toBeGreaterThan(0.2)
  })

  it('scores clean Chinese near zero', () => {
    expect(garbledRatio(CLEAN_ZH)).toBeLessThan(0.02)
  })

  it('scores clean English as zero', () => {
    expect(garbledRatio(CLEAN_EN)).toBe(0)
  })

  it('ignores whitespace', () => {
    expect(garbledRatio('  \n\t  ')).toBe(0)
  })

  it('counts private use, Ext-A, compat, Ext-B, C1 and dingbats as suspicious', () => {
    expect(garbledRatio('a\ue000b')).toBeCloseTo(1 / 3)
    expect(garbledRatio('a㕂b')).toBeCloseTo(1 / 3)
    expect(garbledRatio('a嗀b')).toBeCloseTo(1 / 3)
    expect(garbledRatio('a\udb40\udc00b')).toBeCloseTo(1 / 3)
    expect(garbledRatio('a\x01b')).toBeCloseTo(1 / 3)
    expect(garbledRatio('a✓b')).toBeCloseTo(1 / 3)
  })

  it('keeps common CJK ranges and punctuation clean', () => {
    expect(garbledRatio('一雀鹤，。「」《》——！？；：')).toBe(0)
    expect(garbledRatio('Ext-A 下界 ㏿ 与上界 鿿')).toBe(0)
  })
})

describe('looksGarbled', () => {
  it('flags the real garbled sample', () => {
    expect(looksGarbled(GARBLED_ZH)).toBe(true)
  })

  it('keeps clean books', () => {
    expect(looksGarbled(CLEAN_ZH)).toBe(false)
    expect(looksGarbled(CLEAN_EN)).toBe(false)
  })

  it('skips empty or very short samples', () => {
    expect(looksGarbled('')).toBe(false)
    expect(looksGarbled('短文')).toBe(false)
    expect(looksGarbled('a\ue000b')).toBe(false)
  })

  it('flags a garbled page once there is enough text', () => {
    expect(looksGarbled(GARBLED_ZH.repeat(3))).toBe(true)
  })
})
