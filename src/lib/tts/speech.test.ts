import { describe, expect, it } from 'vitest'
import { splitSpeech, speechUnits, wordAt } from './speech'
import type { ReadAloudBlock } from '../readAloud'

function block(tag: string, text: string): ReadAloudBlock {
  return { tag, text }
}

describe('splitSpeech', () => {
  it('splits Chinese sentences after end marks, keeping closing quotes with the sentence', () => {
    expect(splitSpeech('第一句。第二句！他说：“走吧。”她点头。')).toEqual([
      { text: '第一句。', start: 0 },
      { text: '第二句！', start: 4 },
      { text: '他说：“走吧。”', start: 8 },
      { text: '她点头。', start: 16 },
    ])
  })

  it('treats an ellipsis run as one end mark and keeps the following question mark', () => {
    expect(splitSpeech('等等……然后呢？').map((part) => part.text)).toEqual(['等等……', '然后呢？'])
    expect(splitSpeech('Wait... What?').map((part) => part.text)).toEqual(['Wait...', 'What?'])
  })

  it('does not split decimals, abbreviations, initials, or a lowercase continuation', () => {
    expect(splitSpeech('It costs 3.14 dollars. Dr. Smith waited.').map((part) => part.text)).toEqual([
      'It costs 3.14 dollars.',
      'Dr. Smith waited.',
    ])
    expect(splitSpeech('J. K. Rowling wrote it. We read it.').map((part) => part.text)).toEqual([
      'J. K. Rowling wrote it.',
      'We read it.',
    ])
    expect(splitSpeech('Use e.g. this one. Then stop.').map((part) => part.text)).toEqual([
      'Use e.g. this one.',
      'Then stop.',
    ])
    expect(splitSpeech('One thing. and another.').map((part) => part.text)).toEqual([
      'One thing. and another.',
    ])
  })

  it('keeps a heading whole and breaks a long sentence at a soft punctuation mark', () => {
    const heading = 'A Very Long Heading That Would Otherwise Be Split At A Full Stop. Still The Heading'
    expect(splitSpeech(heading, true)).toEqual([{ text: heading, start: 0 }])
    const clause = '甲'.repeat(120)
    const long = `${clause}，${'乙'.repeat(120)}。`
    const parts = splitSpeech(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((part) => part.text.length <= 220)).toBe(true)
    expect(parts.map((part) => part.text).join('')).toBe(long)
  })
})

describe('speechUnits', () => {
  it('keeps block indices and start offsets through splitting', () => {
    const blocks = [block('h2', '标题'), block('p', '第一句。第二句。'), block('p', '   ')]
    expect(speechUnits(blocks)).toEqual([
      { blockIndex: 0, text: '标题', start: 0, occurrence: 0 },
      { blockIndex: 1, text: '第一句。', start: 0, occurrence: 0 },
      { blockIndex: 1, text: '第二句。', start: 4, occurrence: 0 },
    ])
  })

  it('counts repeated identical sentences so the highlight can pick the later one', () => {
    const blocks = [block('p', '好。好。好。')]
    expect(speechUnits(blocks).map((unit) => unit.occurrence)).toEqual([0, 1, 2])
  })

  it('returns nothing for empty text', () => {
    expect(speechUnits([block('p', '   '), block('p', '')])).toEqual([])
  })
})

describe('wordAt', () => {
  it('uses a boundary length when the browser gives one', () => {
    expect(wordAt('Reading aloud is slow', 8, 5)).toEqual({ text: 'aloud', offset: 8 })
  })

  it('expands a CJK or Latin word around the boundary index', () => {
    expect(wordAt('慢慢读这本书', 2, 0)).toEqual({ text: '读这本书', offset: 2 })
    expect(wordAt('Reading aloud is slow', 8, 0)).toEqual({ text: 'aloud', offset: 8 })
  })

  it('returns null on punctuation and empty text', () => {
    expect(wordAt('好，继续', 1, 0)).toBeNull()
    expect(wordAt('', 0, 0)).toBeNull()
  })
})
